const BASE = "https://api.pd2.tools/api/v1";

export type GameMode = "hardcore" | "softcore";

export type CommonFilter = {
  gameMode: GameMode;
  className?: string;
  minLevel?: number;
};

/** Subset of SkillRequirement (avoiding circular import with filter.ts). */
type SkillReq = { name: string; minLevel: number };

function qs(
  f: CommonFilter,
  opts: { skills?: SkillReq[]; extra?: Record<string, string | number> } = {},
): string {
  const p = new URLSearchParams();
  p.set("gameMode", f.gameMode);
  if (f.className) p.set("classes", f.className);
  if (f.minLevel !== undefined) p.set("minLevel", String(f.minLevel));
  // pd2.tools server-side stats endpoints accept a `skills` JSON-encoded
  // array. Without this, every "stats" endpoint returns aggregates for the
  // entire class — Naj's Puzzler showing 6.7% across ALL Assassins instead of
  // 10.13% across Trapsins specifically (real bug seen in production).
  if (opts.skills && opts.skills.length > 0) {
    p.set("skills", JSON.stringify(opts.skills));
  }
  for (const [k, v] of Object.entries(opts.extra ?? {})) p.set(k, String(v));
  return p.toString();
}

export type ItemUsageRow = {
  item: string;
  itemType: "Unique" | "Set" | "Runeword" | "Rare" | "Magic" | "Crafted" | string;
  numOccurrences: number;
  totalSample: number;
  pct: number;
};

export type SkillUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercTypeUsageRow = { mercType: string; numOccurrences: number; totalSample: number; pct: number };
export type MercItemUsageRow = ItemUsageRow;

export type LevelDistribution = {
  hardcore: Array<{ level: number; count: number }>;
  softcore: Array<{ level: number; count: number }>;
};

export type RawCharactersPage = {
  total: number;
  characters: unknown[];
};

export async function getItemUsage(
  f: CommonFilter,
  skills?: SkillReq[],
): Promise<ItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/item-usage?${qs(f, { skills })}`);
  if (!r.ok) throw new Error(`item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getSkillUsage(
  f: CommonFilter,
  skills?: SkillReq[],
): Promise<SkillUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/skill-usage?${qs(f, { skills })}`);
  if (!r.ok) throw new Error(`skill-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercTypeUsage(
  f: CommonFilter,
  skills?: SkillReq[],
): Promise<MercTypeUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-type-usage?${qs(f, { skills })}`);
  if (!r.ok) throw new Error(`merc-type-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercItemUsage(
  f: CommonFilter,
  skills?: SkillReq[],
): Promise<MercItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-item-usage?${qs(f, { skills })}`);
  if (!r.ok) throw new Error(`merc-item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getLevelDistribution(
  f: Pick<CommonFilter, "gameMode" | "className">,
  skills?: SkillReq[],
): Promise<LevelDistribution> {
  const r = await fetch(
    `${BASE}/characters/stats/level-distribution?${qs(
      { gameMode: f.gameMode, className: f.className },
      { skills },
    )}`,
  );
  if (!r.ok) throw new Error(`level-distribution HTTP ${r.status}`);
  return r.json();
}

export async function getCharactersPage(
  f: Pick<CommonFilter, "gameMode" | "minLevel" | "className">,
  page: number,
): Promise<RawCharactersPage> {
  const r = await fetch(
    `${BASE}/characters?${qs(
      { gameMode: f.gameMode, className: f.className, minLevel: f.minLevel },
      { extra: { page } },
    )}`,
  );
  if (!r.ok) throw new Error(`characters page=${page} HTTP ${r.status}`);
  return r.json();
}

export async function getCharactersByAccount(accountName: string): Promise<unknown> {
  const r = await fetch(`${BASE}/characters/accounts/${encodeURIComponent(accountName)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`characters/accounts/${accountName} HTTP ${r.status}`);
  const body = await r.json();
  // The API returns 200 with {"error":{"message":"..."}} when the account exists
  // but has no characters. Treat any error envelope as "not found".
  if (body && typeof body === "object" && "error" in body) return null;
  // Also treat responses with no characters array as not found.
  if (!Array.isArray((body as Record<string, unknown>).characters)) return null;
  return body;
}
