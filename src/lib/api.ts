const BASE = "https://api.pd2.tools/api/v1";

export type GameMode = "hardcore" | "softcore";

export type CommonFilter = {
  gameMode: GameMode;
  className?: string;
  minLevel?: number;
};

function qs(f: CommonFilter, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  p.set("gameMode", f.gameMode);
  if (f.className) p.set("className", f.className);
  if (f.minLevel !== undefined) p.set("minLevel", String(f.minLevel));
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
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
export type MercTypeUsageRow = { name: string; numOccurrences: number; totalSample: number; pct: number };
export type MercItemUsageRow = ItemUsageRow;

export type LevelDistribution = {
  hardcore: Array<{ level: number; count: number }>;
  softcore: Array<{ level: number; count: number }>;
};

export type RawCharactersPage = {
  total: number;
  characters: unknown[];
};

export async function getItemUsage(f: CommonFilter): Promise<ItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/item-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getSkillUsage(f: CommonFilter): Promise<SkillUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/skill-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`skill-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercTypeUsage(f: CommonFilter): Promise<MercTypeUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-type-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`merc-type-usage HTTP ${r.status}`);
  return r.json();
}

export async function getMercItemUsage(f: CommonFilter): Promise<MercItemUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/merc-item-usage?${qs(f)}`);
  if (!r.ok) throw new Error(`merc-item-usage HTTP ${r.status}`);
  return r.json();
}

export async function getLevelDistribution(f: Pick<CommonFilter, "gameMode" | "className">): Promise<LevelDistribution> {
  const r = await fetch(`${BASE}/characters/stats/level-distribution?${qs({ gameMode: f.gameMode, className: f.className })}`);
  if (!r.ok) throw new Error(`level-distribution HTTP ${r.status}`);
  return r.json();
}

export async function getCharactersPage(
  f: Pick<CommonFilter, "gameMode" | "minLevel">,
  page: number,
): Promise<RawCharactersPage> {
  const r = await fetch(`${BASE}/characters?${qs({ gameMode: f.gameMode, minLevel: f.minLevel }, { page })}`);
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
