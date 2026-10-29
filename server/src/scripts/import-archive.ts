import { statfsSync } from 'node:fs';
import { Pool } from 'pg';
import { importArchive, type ImportOptions } from '../archive/import';
import { defaultHttpGet } from '../archive/pd2tools';
import { loadConfig } from '../config';
import { RateLimiter } from '../upstream/rate-limiter';

/**
 * Imports ended seasons from api.pd2.tools into characters (source 'archive'). Resumable: rerun the
 * same command to continue. Exit codes: 0 done (or --max-pages reached), 3 disk/DB gate tripped, 1 error.
 *   npx tsx src/scripts/import-archive.ts [--seasons 13,12,11] [--modes softcore,hardcore] [--pass 1]
 *     [--no-rollup] [--min-free-gb 6] [--max-db-gb 12] [--max-pages N]
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function num(name: string, fallback: number): number {
  const v = arg(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${v}"`);
  return n;
}

async function main(): Promise<number> {
  const cfg = loadConfig(process.env);
  const seasons = (arg('seasons') ?? '13,12,11').split(',').map(Number);
  const modes = (arg('modes') ?? 'softcore,hardcore').split(',');
  if (seasons.some((s) => !Number.isInteger(s))) throw new Error('--seasons must be integers');
  if (modes.some((m) => m !== 'softcore' && m !== 'hardcore')) throw new Error('--modes must be softcore and/or hardcore');
  const opts: ImportOptions = {
    seasons,
    modes: modes as ImportOptions['modes'],
    pass: num('pass', 1),
    rollup: !process.argv.includes('--no-rollup'),
    minFreeGb: num('min-free-gb', 6),
    maxDbGb: num('max-db-gb', 12),
    maxPages: arg('max-pages') === undefined ? undefined : num('max-pages', 0),
  };
  const pool = new Pool({ connectionString: cfg.databaseUrl, options: '-c jit=off' });
  // Its own limiter for api.pd2.tools only, no peak-hour pause (pause hours 0, 0).
  const limiter = new RateLimiter({ minIntervalMs: 1000, pauseStartHour: 0, pauseEndHour: 0 });
  try {
    const r = await importArchive(
      {
        pool,
        http: defaultHttpGet,
        limiter,
        currentSeason: cfg.currentSeason,
        minLevel: cfg.minLevel,
        freeDiskBytes: () => {
          const s = statfsSync('/');
          return Number(s.bavail) * Number(s.bsize);
        },
        log: (l) => console.log(l),
      },
      opts,
    );
    console.log(`archive import ${r}`);
    return r === 'gate' ? 3 : 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
