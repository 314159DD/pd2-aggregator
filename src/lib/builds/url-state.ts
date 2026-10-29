import { serializeMetaState, DEFAULT_META_STATE, type MetaState } from "@/lib/meta/state";
export type BuildsSort = "level" | "life" | "gear";
export type BuildsSkill = { name: string; minLevel: number };
export type BuildsState = {
  season: number | null;
  gameMode: "softcore" | "hardcore";
  minLevel: 80 | 85 | 90 | 95 | 99;
  classes: string[];
  items: string[];
  skills: BuildsSkill[];
  mercTypes: string[];
  mercItems: string[];
  maxGearHr: number | null;
  sort: BuildsSort;
  dir: "asc" | "desc";
  page: number;
};

export const LEVEL_PRESETS = [80, 85, 90, 95, 99] as const;
export const CLASS_NAMES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"] as const;
const SORTS: readonly BuildsSort[] = ["level", "life", "gear"];

export const DEFAULT_BUILDS_STATE: BuildsState = {
  season: null,
  gameMode: "softcore",
  minLevel: 80,
  classes: [],
  items: [],
  skills: [],
  mercTypes: [],
  mercItems: [],
  maxGearHr: null,
  sort: "level",
  dir: "desc",
  page: 1,
};

function list(p: URLSearchParams, key: string): string[] {
  return (p.get(key) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

function parseSkills(raw: string | null): BuildsSkill[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: BuildsSkill[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== "object") continue;
      const { name, minLevel } = e as Record<string, unknown>;
      if (typeof name !== "string" || !name || typeof minLevel !== "number" || !Number.isInteger(minLevel)) continue;
      out.push({ name, minLevel: Math.min(99, Math.max(0, minLevel)) });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseBuildsState(p: URLSearchParams): BuildsState {
  const d = DEFAULT_BUILDS_STATE;
  const seasonRaw = p.get("season");
  const season = seasonRaw !== null && /^\d+$/.test(seasonRaw) && Number(seasonRaw) > 0 ? Number(seasonRaw) : null;

  const lvlRaw = p.get("minLevel");
  const lvl = lvlRaw !== null && lvlRaw.trim() !== "" ? Number(lvlRaw) : NaN;
  const minLevel = Number.isFinite(lvl) ? ([...LEVEL_PRESETS].reverse().find((x) => x <= lvl) ?? 80) : d.minLevel;

  const budgetRaw = p.get("maxGearHr");
  const budget = budgetRaw !== null && budgetRaw.trim() !== "" ? Number(budgetRaw) : NaN;

  const pageRaw = p.get("page");
  const page = pageRaw !== null && /^\d+$/.test(pageRaw) && Number(pageRaw) >= 1 ? Math.min(100000, Number(pageRaw)) : 1;

  const sortRaw = p.get("sort") as BuildsSort | null;

  return {
    season,
    gameMode: p.get("gameMode") === "hardcore" ? "hardcore" : "softcore",
    minLevel: minLevel as BuildsState["minLevel"],
    classes: list(p, "classes").filter((c) => (CLASS_NAMES as readonly string[]).includes(c)),
    items: list(p, "items"),
    skills: parseSkills(p.get("skills")),
    mercTypes: list(p, "mercTypes"),
    mercItems: list(p, "mercItems"),
    maxGearHr: Number.isFinite(budget) && budget >= 0 ? budget : null,
    sort: sortRaw !== null && SORTS.includes(sortRaw) ? sortRaw : d.sort,
    dir: p.get("dir") === "asc" ? "asc" : "desc",
    page,
  };
}

/** Compact URL form: defaults are omitted, lists are comma-joined. */
export function serializeBuildsState(s: BuildsState): URLSearchParams {
  const d = DEFAULT_BUILDS_STATE;
  const p = new URLSearchParams();
  if (s.season !== null) p.set("season", String(s.season));
  if (s.gameMode !== d.gameMode) p.set("gameMode", s.gameMode);
  if (s.minLevel !== d.minLevel) p.set("minLevel", String(s.minLevel));
  if (s.classes.length) p.set("classes", s.classes.join(","));
  if (s.items.length) p.set("items", s.items.join(","));
  if (s.skills.length) p.set("skills", JSON.stringify(s.skills));
  if (s.mercTypes.length) p.set("mercTypes", s.mercTypes.join(","));
  if (s.mercItems.length) p.set("mercItems", s.mercItems.join(","));
  if (s.maxGearHr !== null) p.set("maxGearHr", String(s.maxGearHr));
  if (s.sort !== d.sort) p.set("sort", s.sort);
  if (s.dir !== d.dir) p.set("dir", s.dir);
  if (s.page !== d.page) p.set("page", String(s.page));
  return p;
}

/** Query for the /builds/usage and /builds/characters endpoints (server param names). */
export function toApiParams(s: BuildsState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.season !== null) p.set("season", String(s.season));
  p.set("gameMode", s.gameMode);
  p.set("minLevel", String(s.minLevel));
  p.set("maxLevel", "99");
  if (s.classes.length) p.set("classes", s.classes.join(","));
  if (s.items.length) p.set("items", s.items.join(","));
  if (s.skills.length) p.set("skills", JSON.stringify(s.skills));
  if (s.mercTypes.length) p.set("mercTypes", s.mercTypes.join(","));
  if (s.mercItems.length) p.set("mercItems", s.mercItems.join(","));
  if (s.maxGearHr !== null) p.set("maxGearHr", String(s.maxGearHr));
  p.set("sort", s.sort);
  p.set("dir", s.dir);
  p.set("page", String(s.page));
  return p;
}

const toggle = (list: string[], name: string): string[] =>
  list.includes(name) ? list.filter((x) => x !== name) : [...list, name];

export const toggleClass = (s: BuildsState, name: string): BuildsState => ({ ...s, classes: toggle(s.classes, name), page: 1 });
export const toggleItem = (s: BuildsState, name: string): BuildsState => ({ ...s, items: toggle(s.items, name), page: 1 });
export const toggleMercType = (s: BuildsState, name: string): BuildsState => ({ ...s, mercTypes: toggle(s.mercTypes, name), page: 1 });
export const toggleMercItem = (s: BuildsState, name: string): BuildsState => ({ ...s, mercItems: toggle(s.mercItems, name), page: 1 });
export const toggleSkill = (s: BuildsState, name: string): BuildsState => ({
  ...s,
  skills: s.skills.some((k) => k.name === name)
    ? s.skills.filter((k) => k.name !== name)
    : [...s.skills, { name, minLevel: 20 }],
  page: 1,
});
export const setLevel = (s: BuildsState, minLevel: BuildsState["minLevel"]): BuildsState => ({ ...s, minLevel, page: 1 });
export const setBudget = (s: BuildsState, maxGearHr: number | null): BuildsState => ({ ...s, maxGearHr, page: 1 });
export const setSort = (s: BuildsState, col: BuildsSort): BuildsState =>
  s.sort === col
    ? { ...s, dir: s.dir === "desc" ? "asc" : "desc", page: 1 }
    : { ...s, sort: col, dir: "desc", page: 1 };
export const clearFilters = (s: BuildsState): BuildsState => ({
  ...s,
  classes: [],
  items: [],
  skills: [],
  mercTypes: [],
  mercItems: [],
  maxGearHr: null,
  page: 1,
});

/** Link to the Meta page (its url-state names) carrying the class, level and skills of this selection. */
export function metaHref(s: BuildsState): string {
  const cls = s.classes[0];
  const next: MetaState = {
    ...DEFAULT_META_STATE,
    season: s.season,
    gameMode: s.gameMode,
    className: cls ?? DEFAULT_META_STATE.className,
    minLevel: s.minLevel,
    skills: s.skills.filter((k) => k.minLevel >= 1),
  };
  return `/?${serializeMetaState(next).toString()}`;
}

/** Link from the Meta page to /builds with the same class, skills and mode; minLevel snaps down to a preset. */
export function buildsHrefFromMeta(s: MetaState): string {
  const minLevel = ([...LEVEL_PRESETS].reverse().find((x) => x <= s.minLevel) ?? 80) as BuildsState["minLevel"];
  const next: BuildsState = {
    ...DEFAULT_BUILDS_STATE,
    season: s.season,
    gameMode: s.gameMode,
    minLevel,
    classes: (CLASS_NAMES as readonly string[]).includes(s.className) ? [s.className] : [],
    skills: s.skills,
  };
  const q = serializeBuildsState(next).toString();
  return q ? `/builds?${q}` : "/builds";
}
