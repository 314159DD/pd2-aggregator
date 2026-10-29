import type { Pool } from 'pg';
import type { Config } from '../config';
import { filterCte } from '../api/filter-sql';
import { parseFilter } from '../api/filters';
import { readRaw } from '../db/characters-repo';

/** pd2.tools leaves these out of item-usage (IGNORED_UNIQUES_ARRAY); Crescent Moon was reported excluded too. */
export const PD2TOOLS_IGNORED_ITEMS = ['Hellfire Torch', 'Annihilus', 'Call to Arms', 'Lidless Wall', 'Crescent Moon'];

export const PARITY_SETS: Array<{ id: string; query: Record<string, string> }> = [
  { id: 'all-sc', query: { season: '13', minLevel: '80', gameMode: 'softcore' } },
  { id: 'all-hc', query: { season: '13', minLevel: '80', gameMode: 'hardcore' } },
  { id: 'paladin', query: { season: '13', minLevel: '80', gameMode: 'softcore', classes: 'Paladin' } },
  {
    id: 'blizz',
    query: { season: '13', minLevel: '80', gameMode: 'softcore', classes: 'Sorceress', skills: '[{"name":"Blizzard","minLevel":20}]' },
  },
  {
    id: 'lfury',
    query: { season: '13', minLevel: '80', gameMode: 'softcore', classes: 'Amazon', skills: '[{"name":"Lightning Fury","minLevel":20}]' },
  },
  {
    id: 'ww-hc90',
    query: { season: '13', gameMode: 'hardcore', classes: 'Barbarian', minLevel: '90', skills: '[{"name":"Whirlwind","minLevel":20}]' },
  },
  { id: 'enigma', query: { season: '13', minLevel: '80', gameMode: 'softcore', items: 'Enigma' } },
  { id: 'def-merc', query: { season: '13', minLevel: '80', gameMode: 'softcore', mercTypes: 'Defensive Auras' } },
];

export type UsageRow = { name: string; pct: number };
export type Check = {
  set: string;
  check: 'breakdown' | 'items' | 'skills' | 'merc-types' | 'merc-items';
  compared: number;
  maxDelta: number;
  failures: string[];
  explained: string[];
  pass: boolean;
};
/** A check before it is attached to a set. failedNames lets the explain step recount only those rows. */
export type CheckResult = Omit<Check, 'set' | 'check'> & { failedNames: string[] };

export type UsageOptions = { tolerance: number; topN: number; minPct: number; exclude: string[] };

const fmt = (n: number): string => String(Number(n.toFixed(2)));

export function compareBreakdown(ours: Record<string, number>, theirs: Record<string, number>): CheckResult {
  const keys = [...new Set([...Object.keys(theirs), ...Object.keys(ours)])];
  const failures: string[] = [];
  let maxDelta = 0;
  for (const k of keys) {
    const o = ours[k] ?? 0;
    const t = theirs[k] ?? 0;
    maxDelta = Math.max(maxDelta, Math.abs(o - t));
    if (o !== t) failures.push(`${k} ${o} vs ${t}`);
  }
  return { compared: keys.length, maxDelta, failures, explained: [], pass: failures.length === 0, failedNames: [] };
}

export function compareUsage(ours: UsageRow[], theirs: UsageRow[], o: UsageOptions): CheckResult {
  const skip = new Set(o.exclude);
  const clean = (rows: UsageRow[]) => rows.filter((r) => !skip.has(r.name));
  const top = (rows: UsageRow[]) =>
    clean(rows)
      .filter((r) => r.pct >= o.minPct)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, o.topN)
      .map((r) => r.name);
  const names = [...new Set([...top(ours), ...top(theirs)])];
  const om = new Map(clean(ours).map((r) => [r.name, r.pct]));
  const tm = new Map(clean(theirs).map((r) => [r.name, r.pct]));
  const failures: string[] = [];
  const failedNames: string[] = [];
  let maxDelta = 0;
  for (const n of names) {
    const a = om.get(n) ?? 0;
    const b = tm.get(n) ?? 0;
    const d = Math.abs(a - b);
    maxDelta = Math.max(maxDelta, d);
    if (d > o.tolerance) {
      failures.push(`${n} ours ${fmt(a)} vs theirs ${fmt(b)}`);
      failedNames.push(n);
    }
  }
  return { compared: names.length, maxDelta, failures, explained: [], pass: failures.length === 0, failedNames };
}

/** Moves failures whose recount from raw lands within `tolerance` of pd2.tools into `explained`. */
export function applyExplained(
  r: CheckResult,
  theirs: UsageRow[],
  recount: Map<string, number>,
  tolerance = 1,
): CheckResult {
  const tm = new Map(theirs.map((x) => [x.name, x.pct]));
  const failures: string[] = [];
  const failedNames: string[] = [];
  const explained = [...r.explained];
  r.failedNames.forEach((n, i) => {
    const re = recount.get(n);
    if (re !== undefined && Math.abs(re - (tm.get(n) ?? 0)) <= tolerance) explained.push(n);
    else {
      failures.push(r.failures[i]);
      failedNames.push(n);
    }
  });
  return { ...r, failures, failedNames, explained, pass: failures.length === 0 };
}

type RawItem = { name?: unknown; is_runeword?: unknown; quality?: { name?: unknown } | null };

function countsAsUsage(it: RawItem): boolean {
  return !!it.is_runeword || it.quality?.name === 'Unique' || it.quality?.name === 'Set';
}

/**
 * Recounts item usage straight from the cohort's raw payloads, the way pd2.tools does: any item in
 * raw.items (equipped, inventory, charms, stash) with that name that is a runeword, unique or set item.
 * Returns pct (0..100) per requested name.
 */
export async function explainItems(
  pool: Pool,
  cfg: Config,
  query: Record<string, string>,
  names: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!names.length) return out;
  const { sql, params } = filterCte(parseFilter(query, cfg));
  const ids = (await pool.query(`${sql} select id from filtered order by id`, params)).rows.map((r) => r.id as number);
  const want = new Set(names);
  const hits = new Map<string, number>(names.map((n) => [n, 0]));
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await pool.query('select raw from characters where id = any($1::int[])', [ids.slice(i, i + 1000)]);
    for (const row of r.rows) {
      const raw = readRaw(row) as { items?: RawItem[] } | null;
      const seen = new Set<string>();
      for (const it of raw?.items ?? []) {
        if (typeof it.name === 'string' && want.has(it.name) && countsAsUsage(it)) seen.add(it.name);
      }
      for (const n of seen) hits.set(n, (hits.get(n) ?? 0) + 1);
    }
  }
  for (const [n, c] of hits) out.set(n, ids.length ? (c / ids.length) * 100 : 0);
  return out;
}

export function formatTable(checks: Check[], excluded: string[] = PD2TOOLS_IGNORED_ITEMS): string {
  const lines = ['set | check | compared | max delta | failures | result'];
  for (const c of checks) {
    lines.push(`${c.set} | ${c.check} | ${c.compared} | ${fmt(c.maxDelta)} | ${c.failures.length} | ${c.pass ? 'PASS' : 'FAIL'}`);
  }
  for (const c of checks) {
    for (const f of c.failures) lines.push(`  FAIL ${c.set} ${c.check}: ${f}`);
    for (const e of c.explained) lines.push(`  explained ${c.set} ${c.check}: ${e} (recount from raw matches pd2.tools)`);
  }
  lines.push(`excluded upstream: ${excluded.join(', ')}`);
  return lines.join('\n');
}
