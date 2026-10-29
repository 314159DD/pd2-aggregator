import { Pool } from 'pg';
import {
  PARITY_SETS,
  PD2TOOLS_IGNORED_ITEMS,
  applyExplained,
  compareBreakdown,
  compareUsage,
  explainItems,
  formatTable,
  type Check,
  type CheckResult,
  type UsageRow,
} from '../archive/parity';
import { PD2TOOLS_BASE, defaultHttpGet, type HttpGet } from '../archive/pd2tools';
import { loadConfig } from '../config';
import { RateLimiter } from '../upstream/rate-limiter';

/**
 * Compares our S13 archive against api.pd2.tools for fixed filter sets. Read-only on both sides.
 *   OUR_API (default https://api.pd2meta.info/api/v1), PD2TOOLS_BASE, DATABASE_URL (enables the explain step)
 * Exits 1 when any check fails. pd2.tools requests go through a 1 req/s limiter.
 */
const OUR_API = process.env.OUR_API ?? 'https://api.pd2meta.info/api/v1';
const THEIR_API = process.env.PD2TOOLS_BASE ?? PD2TOOLS_BASE;
const OPTS = { tolerance: 1, topN: 25, minPct: 1, exclude: PD2TOOLS_IGNORED_ITEMS };

class HttpStatusError extends Error {}

async function getJson(http: HttpGet, limiter: RateLimiter | null, url: string): Promise<unknown> {
  let last = 'no attempt';
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await (limiter ? limiter.schedule(() => http(url)) : http(url));
      if (res.status === 429 || res.status >= 500) {
        limiter?.reportFailure();
        last = `status ${res.status}`;
        continue;
      }
      if (res.status !== 200) throw new HttpStatusError(`GET ${url} returned ${res.status}`);
      limiter?.reportSuccess();
      return await res.json();
    } catch (e) {
      if (e instanceof HttpStatusError) throw e;
      limiter?.reportFailure();
      last = (e as Error).message;
    }
  }
  throw new Error(`GET ${url} failed after 5 attempts (${last})`);
}

const qs = (q: Record<string, string>): string => new URLSearchParams(q).toString();

const asRows = (key: string) => (json: unknown): UsageRow[] =>
  (json as Array<Record<string, unknown>>).map((r) => ({ name: String(r[key]), pct: Number(r.pct) }));

const USAGE: Array<{ check: Check['check']; path: string; key: string; exclude: boolean }> = [
  { check: 'items', path: 'item-usage', key: 'item', exclude: true },
  { check: 'skills', path: 'skill-usage', key: 'name', exclude: false },
  { check: 'merc-types', path: 'merc-type-usage', key: 'mercType', exclude: false },
  { check: 'merc-items', path: 'merc-item-usage', key: 'item', exclude: true },
];

function strip(r: CheckResult): Omit<Check, 'set' | 'check'> {
  const { failedNames: _f, ...rest } = r;
  return rest;
}

async function main(): Promise<number> {
  const http: HttpGet = defaultHttpGet;
  const limiter = new RateLimiter({ minIntervalMs: 1000, pauseStartHour: 0, pauseEndHour: 0 });
  const dbUrl = process.env.DATABASE_URL;
  const pool = dbUrl ? new Pool({ connectionString: dbUrl }) : null;
  const cfg = dbUrl ? loadConfig(process.env) : null;
  const checks: Check[] = [];
  try {
    for (const set of PARITY_SETS) {
      const q = qs({ ...set.query, pageSize: '1' });
      const ob = (await getJson(http, null, `${OUR_API}/characters?${q}`)) as { breakdown: Record<string, number> };
      const tb = (await getJson(http, limiter, `${THEIR_API}/characters?${q}`)) as { breakdown: Record<string, number> };
      checks.push({ set: set.id, check: 'breakdown', ...strip(compareBreakdown(ob.breakdown, tb.breakdown)) });
      for (const u of USAGE) {
        const path = `/characters/stats/${u.path}?${qs(set.query)}`;
        const o = asRows(u.key)(await getJson(http, null, OUR_API + path));
        const t = asRows(u.key)(await getJson(http, limiter, THEIR_API + path));
        let r: CheckResult = compareUsage(o, t, { ...OPTS, exclude: u.exclude ? OPTS.exclude : [] });
        if (u.check === 'items' && r.failedNames.length && pool && cfg) {
          r = applyExplained(r, t, await explainItems(pool, cfg, set.query, r.failedNames));
        }
        checks.push({ set: set.id, check: u.check, ...strip(r) });
      }
    }
    console.log(formatTable(checks));
    if (pool) {
      const p = await pool.query(
        `select mode, pass, next_page, upstream_total, received, inserted, existing, below_min, invalid, dupes, done
         from archive_import_progress where season = 13 order by mode, pass`,
      );
      console.log('importer counters (season 13):');
      for (const row of p.rows) console.log('  ' + JSON.stringify(row));
    }
    return checks.every((c) => c.pass) ? 0 : 1;
  } finally {
    await pool?.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
