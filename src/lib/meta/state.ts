import { readScope } from "@/lib/builds/scope";
import { CLASS_NAMES } from "@/lib/builds/url-state";

export type MetaState = {
  season: number | null;
  gameMode: "softcore" | "hardcore";
  className: string;
  minLevel: number;
  skills: Array<{ name: string; minLevel: number }>;
  mode: "guide" | "diff";
  char: string;
};

/** Change request applied to the newest state, so quick successive changes do not overwrite each other. */
export type MetaUpdate = (fn: (s: MetaState) => MetaState) => void;

export const DEFAULT_META_STATE: MetaState = {
  season: null,
  gameMode: "softcore",
  className: "Paladin",
  minLevel: 80,
  skills: [],
  mode: "guide",
  char: "",
};

const MAX_SKILLS = 20;
const MAX_SKILL_NAME = 60;

function parseSkills(raw: string | null): MetaState["skills"] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MetaState["skills"] = [];
    for (const e of parsed) {
      if (out.length >= MAX_SKILLS) break;
      if (!e || typeof e !== "object") continue;
      const { name, minLevel } = e as Record<string, unknown>;
      if (typeof name !== "string" || !name || typeof minLevel !== "number" || !Number.isInteger(minLevel)) continue;
      out.push({ name: name.slice(0, MAX_SKILL_NAME), minLevel: Math.min(99, Math.max(1, minLevel)) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Accepts old shared links; anything stale or hostile falls back to the defaults. */
export function parseMetaState(p: URLSearchParams): MetaState {
  const scope = readScope(p);
  const cls = p.get("className") ?? "";
  const lvlRaw = p.get("minLevel");
  const lvl = lvlRaw !== null && lvlRaw.trim() !== "" ? Number(lvlRaw) : NaN;
  const minLevel = Number.isFinite(lvl) ? Math.min(99, Math.max(80, Math.trunc(lvl))) : 80;
  return {
    season: scope.season,
    gameMode: scope.gameMode,
    className: (CLASS_NAMES as readonly string[]).includes(cls) ? cls : DEFAULT_META_STATE.className,
    minLevel,
    skills: parseSkills(p.get("skills")),
    mode: p.get("mode") === "diff" ? "diff" : "guide",
    char: (p.get("char") ?? "").trim().slice(0, 50),
  };
}

export function serializeMetaState(s: MetaState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.season !== null) p.set("season", String(s.season));
  p.set("gameMode", s.gameMode);
  p.set("className", s.className);
  if (s.minLevel !== 80) p.set("minLevel", String(s.minLevel));
  if (s.skills.length) p.set("skills", JSON.stringify(s.skills));
  if (s.mode === "diff") {
    p.set("mode", "diff");
    p.set("char", s.char);
  }
  return p;
}

/** Query for GET /meta (server param names). */
export function metaApiParams(s: MetaState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.season !== null) p.set("season", String(s.season));
  p.set("gameMode", s.gameMode);
  p.set("classes", s.className);
  p.set("minLevel", String(s.minLevel));
  if (s.skills.length) p.set("skills", JSON.stringify(s.skills));
  return p;
}
