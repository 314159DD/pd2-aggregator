import type { Pool } from 'pg';
import type { RateLimiter } from '../upstream/rate-limiter';
import { fetchArchivePage, toArchiveCompact, type HttpGet } from './pd2tools';
import { markRollupNotReady, writeArchivePage, type ArchiveRow } from './write';

const GB = 1024 ** 3;
const PAGE_SIZE = 50;
const GATE_EVERY_PAGES = 50;
const DEFAULT_BYTES_PER_CHAR = 50_000;
const MEASURE_AFTER_INSERTS = 2000;
const BYTES_PER_CHAR_FLOOR = DEFAULT_BYTES_PER_CHAR / 2;
/** Advisory lock key: one archive importer at a time (4242021 migrate, 4242022 meta rollup). */
export const ARCHIVE_IMPORT_LOCK_KEY = 4242023;

type Mode = 'softcore' | 'hardcore';

export type ImportOptions = {
  seasons: number[];
  modes: Mode[];
  pass: number;
  rollup: boolean;
  minFreeGb: number;
  maxDbGb: number;
  maxPages?: number;
};

export type ImportDeps = {
  pool: Pool;
  http: HttpGet;
  limiter: RateLimiter;
  currentSeason: number;
  minLevel: number;
  freeDiskBytes: () => number;
  log: (line: string) => void;
};

export function projectGate(x: {
  freeBytes: number;
  dbBytes: number;
  remainingChars: number;
  bytesPerChar: number;
  minFreeGb: number;
  maxDbGb: number;
}): { ok: boolean; projectedBytes: number; reason: string | null } {
  const projectedBytes = x.remainingChars * x.bytesPerChar;
  if (x.freeBytes - projectedBytes < x.minFreeGb * GB) return { ok: false, projectedBytes, reason: 'min-free-disk' };
  if (x.dbBytes + projectedBytes > x.maxDbGb * GB) return { ok: false, projectedBytes, reason: 'max-db-size' };
  return { ok: true, projectedBytes, reason: null };
}

type Progress = { next_page: number; received: number; done: boolean };

async function readProgress(pool: Pool, season: number, mode: Mode, pass: number): Promise<Progress> {
  const r = await pool.query(
    'select next_page, received, done from archive_import_progress where season = $1 and mode = $2 and pass = $3',
    [season, mode, pass],
  );
  return r.rows[0] ?? { next_page: 1, received: 0, done: false };
}

async function dbSize(pool: Pool): Promise<number> {
  return Number((await pool.query('select pg_database_size(current_database()) as s')).rows[0].s);
}

export async function importArchive(deps: ImportDeps, opts: ImportOptions): Promise<'done' | 'gate' | 'max-pages'> {
  for (const s of opts.seasons) {
    if (s >= deps.currentSeason) throw new Error('archive season must be below current season');
  }
  const lock = await deps.pool.connect();
  try {
    const got = (await lock.query('select pg_try_advisory_lock($1) as ok', [ARCHIVE_IMPORT_LOCK_KEY])).rows[0].ok;
    if (!got) throw new Error('another archive import is already running (advisory lock held)');
    try {
      return await run(deps, opts);
    } finally {
      await lock.query('select pg_advisory_unlock($1)', [ARCHIVE_IMPORT_LOCK_KEY]).catch(() => {});
    }
  } finally {
    lock.release();
  }
}

async function run(deps: ImportDeps, opts: ImportOptions): Promise<'done' | 'gate' | 'max-pages'> {
  const { pool, http, limiter, log } = deps;
  if (!opts.rollup) await markRollupNotReady(pool);

  const dbAtStart = await dbSize(pool);
  let insertedThisRun = 0;
  let receivedThisRun = 0;
  let pagesThisRun = 0;

  // Pass 1 expects every row to be new. Later passes revisit an imported set, so they project only the
  // share of rows that turned out new so far (0 before the first page).
  const newShare = (): number => (opts.pass <= 1 ? 1 : receivedThisRun > 0 ? insertedThisRun / receivedThisRun : 0);

  const gate = async (remaining: number): Promise<boolean> => {
    const dbBytes = await dbSize(pool);
    const bytesPerChar =
      insertedThisRun >= MEASURE_AFTER_INSERTS ? Math.max(BYTES_PER_CHAR_FLOOR, (dbBytes - dbAtStart) / insertedThisRun) : DEFAULT_BYTES_PER_CHAR;
    const freeBytes = deps.freeDiskBytes();
    const g = projectGate({
      freeBytes,
      dbBytes,
      remainingChars: remaining,
      bytesPerChar,
      minFreeGb: opts.minFreeGb,
      maxDbGb: opts.maxDbGb,
    });
    if (!g.ok) {
      log(
        `archive gate stop (${g.reason}): free ${(freeBytes / GB).toFixed(2)} GB, db ${(dbBytes / GB).toFixed(2)} GB, ` +
          `projected +${(g.projectedBytes / GB).toFixed(2)} GB for ${remaining} chars, ${Math.round(bytesPerChar)} bytes/char`,
      );
    }
    return g.ok;
  };

  for (const season of opts.seasons) {
    for (const mode of opts.modes) {
      const prog = await readProgress(pool, season, mode, opts.pass);
      if (prog.done) continue;
      let page = prog.next_page;
      let received = prog.received;
      let first = true;
      for (;;) {
        if (opts.maxPages !== undefined && pagesThisRun >= opts.maxPages) return 'max-pages';
        let data = await fetchArchivePage(http, limiter, { season, mode, page, pageSize: PAGE_SIZE });
        const shortMidSet = (n: number) => n > 0 && n < PAGE_SIZE && page * PAGE_SIZE < data.total;
        if (shortMidSet(data.characters.length)) {
          log(`warning: s${season} ${mode} p${page} returned ${data.characters.length} of ${PAGE_SIZE} rows before the total (${data.total}); fetching it once more`);
          data = await fetchArchivePage(http, limiter, { season, mode, page, pageSize: PAGE_SIZE });
          if (shortMidSet(data.characters.length)) {
            log(`warning: s${season} ${mode} p${page} is still short (${data.characters.length}); continuing, a pass 2 run picks up any gap`);
          }
        }
        if (first || page % GATE_EVERY_PAGES === 0) {
          if (!(await gate(Math.max(0, Math.ceil((data.total - received) * newShare()))))) return 'gate';
        }
        first = false;
        const t0 = Date.now();
        // A name repeated within one page is written once (the writer's insert mapping assumes this).
        const byName = new Map<string, ArchiveRow>();
        let belowMin = 0;
        let invalid = 0;
        let dupes = 0;
        for (const raw of data.characters) {
          let m;
          try {
            m = toArchiveCompact(raw, mode, deps.minLevel);
          } catch (e) {
            log(`warning: s${season} ${mode} p${page} character skipped as invalid: ${(e as Error).message}`);
            m = { kind: 'invalid' as const };
          }
          if (m.kind === 'below_min') belowMin++;
          else if (m.kind === 'invalid') invalid++;
          else if (byName.has(m.row.compact.name)) dupes++;
          else byName.set(m.row.compact.name, m.row);
        }
        const done = data.characters.length === 0 || page * PAGE_SIZE >= data.total;
        const w = await writeArchivePage(pool, {
          season,
          mode,
          pass: opts.pass,
          page,
          upstreamTotal: data.total,
          rows: [...byName.values()],
          counts: { received: data.characters.length, belowMin, invalid, dupes },
          done,
          rollup: opts.rollup,
        });
        insertedThisRun += w.inserted;
        received += data.characters.length;
        receivedThisRun += data.characters.length;
        pagesThisRun++;
        log(
          `archive s${season} ${mode} pass${opts.pass} p${page}/${Math.ceil(data.total / PAGE_SIZE)} ` +
            `+${w.inserted} existing ${w.existing} below ${belowMin} invalid ${invalid} dupes ${dupes} write ${Date.now() - t0}ms`,
        );
        if (done) break;
        page++;
      }
    }
  }
  return 'done';
}
