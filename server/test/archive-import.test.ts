import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import fixture from './fixtures/pd2tools-page.json';
import { RateLimiter } from '../src/upstream/rate-limiter';
import {
  archivePageUrl,
  fetchArchivePage,
  defaultHttpGet,
  toArchiveCompact,
  ArchiveFetchError,
  type HttpGet,
} from '../src/archive/pd2tools';
import { importArchive, projectGate, ARCHIVE_IMPORT_LOCK_KEY, type ImportDeps, type ImportOptions } from '../src/archive/import';
import { writeArchivePage } from '../src/archive/write';
import { metaRollupState, rebuildMetaRollup } from '../src/db/meta-rollup';

const GB = 1024 ** 3;
type Raw = Record<string, any>;
const base = fixture.characters as Raw[];

let pool: Pool;
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await pool?.end();
  pool = await freshDb();
});

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A distinct upstream character: the first fixture character under a new name. */
function mk(name: string, over: (c: Raw) => void = () => {}): Raw {
  const c = clone(base[0]);
  c.character.name = name;
  c.accountName = `acc-${name}`;
  over(c);
  return c;
}

function fakeLimiter() {
  let t = Date.UTC(2026, 0, 1, 12, 0, 0);
  const starts: number[] = [];
  const limiter = new RateLimiter({
    minIntervalMs: 1000,
    pauseStartHour: 0,
    pauseEndHour: 0,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  return { limiter, starts, now: () => t };
}

/** Serves `all` in pages of 50 for season 13 softcore; `fail` can override a page's response. */
function upstream(all: Raw[], fail: Record<number, () => { status: number; json(): Promise<unknown> }> = {}) {
  const urls: string[] = [];
  const http: HttpGet = async (url) => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    if (fail[page]) return fail[page]();
    const chars = all.slice((page - 1) * 50, page * 50);
    return { status: 200, json: async () => ({ total: all.length, breakdown: {}, characters: chars }) };
  };
  return { http, urls };
}

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  seasons: [13],
  modes: ['softcore'],
  pass: 1,
  rollup: true,
  minFreeGb: 6,
  maxDbGb: 12,
  ...over,
});

function deps(http: HttpGet, over: Partial<ImportDeps> = {}): ImportDeps & { lines: string[] } {
  const lines: string[] = [];
  return {
    pool,
    http,
    limiter: fakeLimiter().limiter,
    currentSeason: 14,
    minLevel: 80,
    freeDiskBytes: () => 500 * GB,
    log: (l) => lines.push(l),
    lines,
    ...over,
  };
}

const progress = async () =>
  (await pool.query('select * from archive_import_progress where season = 13 and mode = $1 and pass = 1', ['softcore'])).rows[0];
const count = async (table = 'characters') => (await pool.query(`select count(*)::int n from ${table}`)).rows[0].n as number;

describe('archivePageUrl', () => {
  it('uses the documented parameter order', () => {
    expect(archivePageUrl(13, 'softcore', 2)).toBe(
      'https://api.pd2.tools/api/v1/characters?season=13&gameMode=softcore&page=2&pageSize=50',
    );
  });
});

describe('toArchiveCompact', () => {
  it('maps the fixture characters with the requested mode', () => {
    for (const c of base) {
      const r = toArchiveCompact(c, 'softcore', 80);
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect(r.row.compact.mode).toBe('softcore');
        expect(r.row.compact.account).toBe(c.accountName);
        expect(r.row.lastUpdated.getTime()).toBe(c.lastUpdated);
      }
    }
  });

  it('takes the mode from the request and ignores is_ladder and the payload mode', () => {
    const c = mk('Odd', (x) => {
      x.character.status.is_ladder = false;
      x.character.status.is_hardcore = true;
    });
    const r = toArchiveCompact(c, 'softcore', 80);
    expect(r.kind === 'ok' && r.row.compact.mode).toBe('softcore');
  });

  it('keeps a negative (int32 overflow) experience', () => {
    const c = mk('Neg', (x) => {
      x.character.status.is_ladder = false;
      x.character.experience = -774482042;
    });
    const r = toArchiveCompact(c, 'hardcore', 80);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.row.compact.experience).toBe(-774482042);
  });

  it('handles a missing mercenary and an empty accountName', () => {
    const c = mk('NoMerc', (x) => {
      delete x.mercenary;
      x.accountName = '';
    });
    const r = toArchiveCompact(c, 'softcore', 80);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.row.compact.mercDescription).toBeNull();
      expect(r.row.compact.account).toBeNull();
    }
  });

  it('classifies level 79, empty and null payloads', () => {
    expect(toArchiveCompact(mk('Low', (x) => (x.character.level = 79)), 'softcore', 80)).toEqual({ kind: 'below_min' });
    expect(toArchiveCompact({}, 'softcore', 80)).toEqual({ kind: 'invalid' });
    expect(toArchiveCompact(null, 'softcore', 80)).toEqual({ kind: 'invalid' });
  });

  it('falls back to the import time when lastUpdated is missing', () => {
    const before = Date.now();
    const r = toArchiveCompact(mk('NoTs', (x) => delete x.lastUpdated), 'softcore', 80);
    expect(r.kind === 'ok' && r.row.lastUpdated.getTime() >= before).toBe(true);
  });
});

describe('fetchArchivePage', () => {
  const ok = { status: 200, json: async () => ({ total: 1, breakdown: { Amazon: 1 }, characters: [{}] }) };

  it('retries 429 and 503 and then succeeds', async () => {
    const { limiter } = fakeLimiter();
    const seq = [{ status: 429, json: async () => ({}) }, { status: 503, json: async () => ({}) }, ok];
    let i = 0;
    const page = await fetchArchivePage(async () => seq[i++], limiter, { season: 13, mode: 'softcore', page: 1 });
    expect(page.total).toBe(1);
    expect(page.characters).toHaveLength(1);
    expect(limiter.requestCount).toBe(3);
  });

  it('gives up after five attempts', async () => {
    const { limiter } = fakeLimiter();
    const http: HttpGet = async () => ({ status: 503, json: async () => ({}) });
    await expect(fetchArchivePage(http, limiter, { season: 13, mode: 'softcore', page: 1 })).rejects.toBeInstanceOf(
      ArchiveFetchError,
    );
    expect(limiter.requestCount).toBe(5);
  });

  it('retries network errors', async () => {
    const { limiter } = fakeLimiter();
    let i = 0;
    const http: HttpGet = async () => {
      if (i++ === 0) throw new Error('ECONNRESET');
      return ok;
    };
    await fetchArchivePage(http, limiter, { season: 13, mode: 'softcore', page: 1 });
    expect(limiter.requestCount).toBe(2);
  });

  it('fails at once on other statuses and on odd bodies', async () => {
    const { limiter } = fakeLimiter();
    await expect(
      fetchArchivePage(async () => ({ status: 400, json: async () => ({}) }), limiter, { season: 13, mode: 'softcore', page: 1 }),
    ).rejects.toBeInstanceOf(ArchiveFetchError);
    expect(limiter.requestCount).toBe(1);
    await expect(
      fetchArchivePage(async () => ({ status: 200, json: async () => ({ total: 'x' }) }), limiter, {
        season: 13,
        mode: 'softcore',
        page: 1,
      }),
    ).rejects.toBeInstanceOf(ArchiveFetchError);
    expect(limiter.requestCount).toBe(2);
  });

  it('spaces request starts by at least one second', async () => {
    const f = fakeLimiter();
    const starts: number[] = [];
    const http: HttpGet = async () => {
      starts.push(f.now());
      return ok;
    };
    for (let p = 1; p <= 3; p++) await fetchArchivePage(http, f.limiter, { season: 13, mode: 'softcore', page: p });
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
  });
});

describe('projectGate', () => {
  const x = { freeBytes: 5 * GB, dbBytes: 1 * GB, remainingChars: 40000, bytesPerChar: 50000, minFreeGb: 4, maxDbGb: 12 };
  it('stops when free disk would fall below the floor', () => {
    expect(projectGate(x).ok).toBe(false);
    expect(projectGate({ ...x, freeBytes: 10 * GB }).ok).toBe(true);
  });
  it('stops when the database would exceed the budget', () => {
    const r = projectGate({ ...x, freeBytes: 100 * GB, dbBytes: 11 * GB });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('max-db-size');
  });
});

describe('defaultHttpGet', () => {
  it('sends the user agent and a timeout signal', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await defaultHttpGet('https://example.test/x');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('pd2meta.info');
    spy.mockRestore();
  });
});

describe('importArchive', () => {
  const chars = (n: number, prefix = 'C') => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`));

  it('imports 120 characters in three pages and does nothing on a rerun', async () => {
    const up = upstream(chars(120));
    const d = deps(up.http);
    expect(await importArchive(d, opts())).toBe('done');
    expect(up.urls).toHaveLength(3);
    expect(await count()).toBe(120);
    const p = await progress();
    expect(p).toMatchObject({ done: true, next_page: 4, received: 120, inserted: 120 });
    expect(d.lines).toHaveLength(3);
    expect(d.lines[0]).toMatch(/^archive s13 softcore pass1 p1\/3 \+50 existing 0 below 0 invalid 0 dupes 0 write \d+ms$/);
    expect(await importArchive(d, opts())).toBe('done');
    expect(up.urls).toHaveLength(3);
  });

  it('resumes at next_page after a failed page', async () => {
    const all = chars(120);
    const bad = upstream(all, { 2: () => ({ status: 400, json: async () => ({}) }) });
    await expect(importArchive(deps(bad.http), opts())).rejects.toBeInstanceOf(ArchiveFetchError);
    expect(await count()).toBe(50);
    expect((await progress()).next_page).toBe(2);
    const good = upstream(all);
    await importArchive(deps(good.http), opts());
    expect(good.urls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['2', '3']);
    expect(await count()).toBe(120);
  });

  it('counts rows that shift onto the next page as existing, never as a second insert', async () => {
    const first = chars(50);
    const second = [...first.slice(48), ...chars(18, 'N')];
    const http: HttpGet = async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      const characters = page === 1 ? first : second;
      return { status: 200, json: async () => ({ total: 70, breakdown: {}, characters }) };
    };
    await importArchive(deps(http), opts());
    expect(await count()).toBe(68);
    const p = await progress();
    expect(p.existing).toBe(2);
    expect(p.received).toBe(70);
    expect(p.inserted).toBe(68);
  });

  it('writes a name repeated within one page once', async () => {
    const page = [...chars(3), mk('C0'), mk('C1')];
    const up = upstream(page);
    const d = deps(up.http);
    await importArchive(d, opts());
    expect(await count()).toBe(3);
    expect(await count('character_items')).toBeGreaterThan(0);
    expect(await progress()).toMatchObject({ received: 5, inserted: 3, dupes: 2, existing: 0 });
    expect(d.lines[0]).toContain('dupes 2');
  });

  it('counts below_min and invalid without aborting the page', async () => {
    const page = [mk('Hi'), mk('Low', (x) => (x.character.level = 79)), {}, mk('Neg', (x) => (x.character.experience = -774482042))];
    const up = upstream(page);
    await importArchive(deps(up.http), opts());
    expect(await count()).toBe(2);
    expect(await progress()).toMatchObject({ below_min: 1, invalid: 1, inserted: 2 });
  });

  it('refuses a season that is not below the current one before any request', async () => {
    const up = upstream(chars(3));
    await expect(importArchive(deps(up.http, { currentSeason: 14 }), opts({ seasons: [14] }))).rejects.toThrow(
      'archive season must be below current season',
    );
    await expect(importArchive(deps(up.http, { currentSeason: 14 }), opts({ seasons: [13, 15] }))).rejects.toThrow();
    expect(up.urls).toHaveLength(0);
  });

  it('stops at the disk gate after one fetch with nothing written', async () => {
    const up = upstream(chars(120));
    const d = deps(up.http, { freeDiskBytes: () => 1 * GB });
    expect(await importArchive(d, opts())).toBe('gate');
    expect(up.urls).toHaveLength(1);
    expect(await count()).toBe(0);
    expect(await progress()).toBeUndefined();
    expect(d.lines.join('\n')).toMatch(/free .* GB, db .* GB, projected .* GB .* bytes\/char/);
  });

  it('honours --max-pages and continues from there', async () => {
    const all = chars(120);
    const up = upstream(all);
    expect(await importArchive(deps(up.http), opts({ maxPages: 2 }))).toBe('max-pages');
    expect(await count()).toBe(100);
    expect(await importArchive(deps(up.http), opts({ maxPages: 2 }))).toBe('done');
    expect(up.urls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2', '3']);
  });

  it('walks seasons in the given order and both modes', async () => {
    const urls: string[] = [];
    const http: HttpGet = async (url) => {
      urls.push(url);
      return { status: 200, json: async () => ({ total: 0, breakdown: {}, characters: [] }) };
    };
    await importArchive(deps(http), opts({ seasons: [13, 12], modes: ['softcore', 'hardcore'] }));
    expect(urls.map((u) => new URL(u).searchParams.get('season') + new URL(u).searchParams.get('gameMode'))).toEqual([
      '13softcore',
      '13hardcore',
      '12softcore',
      '12hardcore',
    ]);
  });

  it('leaves the rollup not-ready with rollup false and exact facts with rollup true', async () => {
    await rebuildMetaRollup(pool);
    expect(await metaRollupState(pool)).toBe('ok');
    await importArchive(deps(upstream(chars(3)).http), opts({ rollup: false }));
    expect(await metaRollupState(pool)).toBe('not-ready');
  });

  it('keeps the rollup equal to a rebuild after an import', async () => {
    await rebuildMetaRollup(pool);
    await importArchive(deps(upstream(chars(5)).http), opts());
    const snap = async () =>
      (await pool.query('select * from meta_rollup order by season, mode, class, level, kind, k1, k2, k3, val')).rows;
    const live = await snap();
    await rebuildMetaRollup(pool);
    expect(await snap()).toEqual(live);
  });

  it('rewriting an existing row with different data changes nothing', async () => {
    await rebuildMetaRollup(pool);
    await importArchive(deps(upstream(chars(3)).http), opts());
    const dump = async () => ({
      ch: (await pool.query('select * from characters order by id')).rows,
      items: (await pool.query('select * from character_items order by character_id, id')).rows,
      sk: (await pool.query('select * from character_skills order by character_id, skill')).rows,
      roll: (await pool.query('select * from meta_rollup order by season, mode, class, level, kind, k1, k2, k3, val')).rows,
    });
    const before = await dump();
    const r = toArchiveCompact(
      mk('C1', (x) => {
        x.character.level = 99;
        x.character.experience = 5;
        x.items = [];
      }),
      'softcore',
      80,
    );
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const w = await writeArchivePage(pool, {
      season: 13,
      mode: 'softcore',
      pass: 2,
      page: 1,
      upstreamTotal: 1,
      rows: [r.row],
      counts: { received: 1, belowMin: 0, invalid: 0 },
      done: true,
      rollup: true,
    });
    expect(w).toEqual({ inserted: 0, existing: 1 });
    expect(await dump()).toEqual(before);
  });
  it('does not refuse a pass 2 over an already imported set because of a tight gate', async () => {
    const all = chars(120);
    await importArchive(deps(upstream(all).http), opts());
    const tight = deps(upstream(all).http, { freeDiskBytes: () => 6 * GB + 1_000_000 });
    expect(await importArchive(tight, opts({ pass: 2 }))).toBe('done');
    expect(await count()).toBe(120);
    expect(await progress()).toBeDefined();
    const p2 = (await pool.query('select * from archive_import_progress where pass = 2')).rows[0];
    expect(p2).toMatchObject({ received: 120, inserted: 0, existing: 120, done: true });
    // The same tight gate does stop a pass 1 over new rows.
    const fresh = deps(upstream(chars(120, 'Z')).http, { freeDiskBytes: () => 6 * GB + 1_000_000 });
    expect(await importArchive(fresh, opts({ seasons: [12], pass: 1 }))).toBe('gate');
  });

  it('checks --max-pages before each fetch, also at a chunk boundary', async () => {
    const none = upstream(chars(60));
    expect(await importArchive(deps(none.http), opts({ maxPages: 0 }))).toBe('max-pages');
    expect(none.urls).toHaveLength(0);
    // Two full pages end the softcore chunk exactly at the cap; hardcore must not be fetched.
    const hundred = chars(100);
    const http: HttpGet = async (url) => {
      const u = new URL(url);
      const page = Number(u.searchParams.get('page'));
      return { status: 200, json: async () => ({ total: 100, breakdown: {}, characters: hundred.slice((page - 1) * 50, page * 50) }) };
    };
    const urls: string[] = [];
    const counting: HttpGet = async (u) => (urls.push(u), http(u));
    expect(await importArchive(deps(counting), opts({ modes: ['softcore', 'hardcore'], maxPages: 2 }))).toBe('max-pages');
    expect(urls).toHaveLength(2);
    expect(await count()).toBe(100);
  });

  it('refetches a short page before the total once instead of ending the chunk', async () => {
    const all = chars(120);
    const urls: string[] = [];
    let shortServed = false;
    const http: HttpGet = async (url) => {
      urls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      let characters = all.slice((page - 1) * 50, page * 50);
      if (page === 1 && !shortServed) {
        shortServed = true;
        characters = characters.slice(0, 30);
      }
      return { status: 200, json: async () => ({ total: 120, breakdown: {}, characters }) };
    };
    const d = deps(http);
    expect(await importArchive(d, opts())).toBe('done');
    expect(urls).toHaveLength(4);
    expect(await count()).toBe(120);
    expect(d.lines.some((l) => l.startsWith('warning:') && l.includes('p1'))).toBe(true);
  });

  it('keeps going when a short page stays short and ends on an empty page', async () => {
    const all = chars(120);
    const http: HttpGet = async (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      const characters = page === 1 ? all.slice(0, 30) : page === 2 ? all.slice(50, 100) : [];
      return { status: 200, json: async () => ({ total: 120, breakdown: {}, characters }) };
    };
    const d = deps(http);
    expect(await importArchive(d, opts())).toBe('done');
    expect(await count()).toBe(80);
    expect(await progress()).toMatchObject({ done: true, received: 80 });
    expect(d.lines.filter((l) => l.startsWith('warning:')).length).toBe(2);
  });

  it('counts a character that throws while mapping as invalid and keeps the page', async () => {
    const page = [mk('Fine'), mk('Boom', (x) => (x.items = {})), mk('Fine2')];
    const d = deps(upstream(page).http);
    await importArchive(d, opts());
    expect(await count()).toBe(2);
    expect(await progress()).toMatchObject({ invalid: 1, inserted: 2, received: 3 });
    expect(d.lines.some((l) => l.startsWith('warning:') && l.includes('invalid'))).toBe(true);
  });

  it('refuses to run while another importer holds the lock', async () => {
    const other = await pool.connect();
    try {
      await other.query('select pg_advisory_lock($1)', [ARCHIVE_IMPORT_LOCK_KEY]);
      const up = upstream(chars(3));
      await expect(importArchive(deps(up.http), opts())).rejects.toThrow(/already running/);
      expect(up.urls).toHaveLength(0);
    } finally {
      await other.query('select pg_advisory_unlock($1)', [ARCHIVE_IMPORT_LOCK_KEY]);
      other.release();
    }
    // And releases its own lock afterwards.
    const up = upstream(chars(3));
    await importArchive(deps(up.http), opts());
    await importArchive(deps(up.http), opts({ pass: 2 }));
  });
});
