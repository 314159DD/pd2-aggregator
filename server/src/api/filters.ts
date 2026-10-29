import type { Config } from '../config';

export type CharacterFilter = {
  season: number;
  mode: 'softcore' | 'hardcore';
  minLevel: number;
  maxLevel: number;
  classes: string[];
  items: string[];
  skills: Array<{ name: string; minLevel: number }>;
  mercTypes: string[];
  mercItems: string[];
};

function first(v: unknown): string | undefined {
  if (Array.isArray(v)) return first(v[0]);
  return typeof v === 'string' ? v : undefined;
}

function intParam(v: unknown, fallback: number, lo: number, hi: number): number {
  const s = first(v);
  if (s === undefined || s.trim() === '') return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function list(v: unknown): string[] {
  const s = first(v);
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function parseSkills(v: unknown): Array<{ name: string; minLevel: number }> {
  const s = first(v);
  if (!s) return [];
  try {
    const parsed: unknown = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    const out: Array<{ name: string; minLevel: number }> = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object') continue;
      const { name, minLevel } = e as Record<string, unknown>;
      if (typeof name !== 'string' || !name || typeof minLevel !== 'number' || !Number.isInteger(minLevel)) continue;
      out.push({ name, minLevel: Math.min(99, Math.max(0, minLevel)) });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseFilter(q: Record<string, unknown>, cfg: Config): CharacterFilter {
  return {
    season: intParam(q.season, cfg.currentSeason, 0, 1_000_000),
    mode: first(q.gameMode)?.toLowerCase() === 'hardcore' ? 'hardcore' : 'softcore',
    minLevel: intParam(q.minLevel, 80, 1, 99),
    maxLevel: intParam(q.maxLevel, 99, 1, 99),
    classes: list(q.classes),
    items: list(q.items),
    skills: parseSkills(q.skills),
    mercTypes: list(q.mercTypes),
    mercItems: list(q.mercItems),
  };
}
