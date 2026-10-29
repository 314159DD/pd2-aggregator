const BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pd2meta.info/api/v1";

export const API_BASE = BASE;

export type GameMode = "hardcore" | "softcore";

export type CommonFilter = {
  gameMode: GameMode;
  className?: string;
  minLevel?: number;
};

type SkillReq = { name: string; minLevel: number };

function qs(f: CommonFilter, skills?: SkillReq[]): string {
  const p = new URLSearchParams();
  p.set("gameMode", f.gameMode);
  if (f.className) p.set("classes", f.className);
  if (f.minLevel !== undefined) p.set("minLevel", String(f.minLevel));
  // Without `skills` the stats endpoints aggregate the whole class.
  if (skills && skills.length > 0) p.set("skills", JSON.stringify(skills));
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

export async function getSkillUsage(
  f: CommonFilter,
  skills?: SkillReq[],
  signal?: AbortSignal,
): Promise<SkillUsageRow[]> {
  const r = await fetch(`${BASE}/characters/stats/skill-usage?${qs(f, skills)}`, { signal });
  if (!r.ok) throw new Error(`skill-usage HTTP ${r.status}`);
  return r.json();
}
