import type { Pool } from 'pg';
import { readRawWithAccount } from '../db/characters-repo';
import { getPricesFor, type ItemPrice } from '../db/prices-repo';
import CharacterStatParser from '../core/vendor/character-stats';
import type { CharStats } from '../core/vendor/types';

type Mode = 'softcore' | 'hardcore';

export type CharacterDetail = Record<string, unknown> & {
  realStats: CharStats | null;
  gear: { valueHr: number | null; partial: boolean; mercValueHr: number | null };
  prices: Record<string, ItemPrice | null>;
  season: number;
  mode: Mode;
  lastIngestedAt: string;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Row for the requested mode, else the other mode (pd2.tools semantics). */
async function findCharacter<T extends string>(
  pool: Pool,
  season: number,
  mode: Mode,
  name: string,
  columns: T,
): Promise<Record<string, any> | null> {
  const r = await pool.query(
    `select ${columns}, mode from characters
     where season = $1 and lower(name) = lower($3)
     order by (mode = $2) desc, id limit 1`,
    [season, mode, name],
  );
  return r.rows[0] ?? null;
}

function computeStats(raw: unknown, name: string): CharStats | null {
  try {
    return new CharacterStatParser(raw as any).parseAndGetCharStats();
  } catch (e) {
    console.warn(`${new Date().toISOString()} WARN character-stats failed for ${name}`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function characterDetail(
  pool: Pool,
  season: number,
  mode: Mode,
  name: string,
): Promise<CharacterDetail | null> {
  const c = await findCharacter(
    pool,
    season,
    mode,
    name,
    'id, name, account, raw, last_ingested_at, gear_value_hr, gear_value_partial, merc_gear_value_hr',
  );
  if (!c) return null;
  const raw = readRawWithAccount(c as { raw: Buffer; account?: string | null });
  if (!raw || typeof raw !== 'object') return null;
  const foundMode: Mode = c.mode;

  const items = await pool.query(
    `select distinct name from character_items
     where character_id = $1 and (is_runeword or quality in ('Unique','Set')) and name <> ''`,
    [c.id],
  );
  const itemNames: string[] = items.rows.map((x) => x.name);
  const priceMap = await getPricesFor(pool, foundMode, itemNames);
  const prices: Record<string, ItemPrice | null> = {};
  for (const n of itemNames) prices[n] = priceMap.get(n) ?? null;

  return {
    ...(raw as Record<string, unknown>),
    realStats: computeStats(raw, c.name),
    gear: { valueHr: num(c.gear_value_hr), partial: c.gear_value_partial, mercValueHr: num(c.merc_gear_value_hr) },
    prices,
    season,
    mode: foundMode,
    lastIngestedAt: new Date(c.last_ingested_at).toISOString(),
  };
}

export async function characterHistory(
  pool: Pool,
  season: number,
  mode: Mode,
  name: string,
): Promise<{ history: Array<{ ts: string; level: number; experience: number }>; total: number } | null> {
  const c = await findCharacter(pool, season, mode, name, 'id');
  if (!c) return null;
  const r = await pool.query(
    'select ts, level, experience from character_history where character_id = $1 order by ts asc',
    [c.id],
  );
  const history = r.rows.map((x) => ({ ts: new Date(x.ts).toISOString(), level: x.level, experience: Number(x.experience) }));
  return { history, total: history.length };
}
