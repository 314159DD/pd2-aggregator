"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SkillIcon } from "@/components/builds/ItemIcon";
import { BUILD_PRESETS, PRESET_MIN_LEVEL, isPresetActive } from "@/lib/buildPresets";
import { CLASS_NAMES } from "@/lib/builds/url-state";
import { getSkillUsage, type SkillUsageRow } from "@/lib/api";
import { tierSquareClass } from "@/lib/kontra/tierStyle";
import { DEFAULT_META_STATE, type MetaState, type MetaUpdate } from "@/lib/meta/state";
import { cn } from "@/lib/utils";

const DEFAULT_POINTS = 20;

type Draft = Pick<MetaState, "className" | "minLevel" | "skills" | "mode" | "char">;

const pick = (s: MetaState): Draft => ({ className: s.className, minLevel: s.minLevel, skills: s.skills, mode: s.mode, char: s.char });
const keyOf = (d: Draft) => JSON.stringify(d);

const LABEL = "block text-xs uppercase tracking-widest text-muted-ink mb-2";

/** Old filter panel: a draft the user edits, applied with Generate. Game mode applies at once (it is also the header scope). */
export function FilterForm({ state, onChange }: { state: MetaState; onChange: MetaUpdate }) {
  const committed = pick(state);
  const committedKey = keyOf(committed);
  const [draft, setDraft] = useState<Draft>(committed);
  const [seen, setSeen] = useState(committedKey);
  // The URL moved (back button, a link, Reset): the draft follows it.
  if (seen !== committedKey) {
    setSeen(committedKey);
    setDraft(committed);
  }

  const [skillList, setSkillList] = useState<SkillUsageRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // The list re-aggregates inside the cohort of the skills already picked, like pd2.tools/builds.
  const skillsKey = draft.skills.map((sk) => sk.name).join(",");
  const { gameMode } = state;
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setSkillsLoading(true);
      setSkillsError(null);
      getSkillUsage({ gameMode, className: draft.className, minLevel: draft.minLevel }, draft.skills, ac.signal)
        .then((rows) => {
          if (!ac.signal.aborted) setSkillList([...rows].sort((a, b) => b.pct - a.pct));
        })
        .catch((e) => {
          if (!ac.signal.aborted) setSkillsError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!ac.signal.aborted) setSkillsLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // skills are keyed by name so editing a chip's points does not refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.className, draft.minLevel, gameMode, skillsKey, retry]);

  const selected = new Set(draft.skills.map((sk) => sk.name));
  const toggleSkill = (name: string) =>
    setDraft((d) => ({
      ...d,
      skills: d.skills.some((k) => k.name === name) ? d.skills.filter((k) => k.name !== name) : [...d.skills, { name, minLevel: DEFAULT_POINTS }],
    }));
  const setPoints = (name: string, n: number) =>
    setDraft((d) => ({ ...d, skills: d.skills.map((k) => (k.name === name ? { ...k, minLevel: n } : k)) }));

  const generate = () => onChange((s) => ({ ...s, ...draft, char: draft.mode === "diff" ? draft.char.trim() : "" }));
  const reset = () => onChange((s) => ({ ...DEFAULT_META_STATE, season: s.season, gameMode: s.gameMode }));

  const presets = BUILD_PRESETS[draft.className] ?? [];
  const names = draft.skills.map((s) => s.name);

  const tab = (active: boolean) =>
    cn(
      "px-3 py-1.5 text-sm uppercase tracking-wider transition border-b-2 outline-none focus-visible:outline-2 focus-visible:outline-accent-text",
      active ? "rarity-unique font-semibold border-[#c9a04b]" : "text-muted-ink hover:text-[#a08f5d] border-transparent",
    );

  return (
    <form
      className="d2-panel rounded-sm p-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        generate();
      }}
    >
      <div role="group" aria-label="View" className="flex gap-1 border-b border-[#3d2817] -mt-1">
        <button type="button" aria-pressed={draft.mode === "guide"} className={tab(draft.mode === "guide")} onClick={() => setDraft({ ...draft, mode: "guide" })}>
          Build a guide
        </button>
        <button type="button" aria-pressed={draft.mode === "diff"} className={tab(draft.mode === "diff")} onClick={() => setDraft({ ...draft, mode: "diff" })}>
          Diff my character
        </button>
      </div>

      {draft.mode === "diff" && (
        <input
          type="text"
          maxLength={50}
          aria-label="Character or account name"
          placeholder="Character name or account name"
          value={draft.char}
          onChange={(e) => setDraft({ ...draft, char: e.target.value })}
          className="feld w-full"
        />
      )}

      <div role="group" aria-label="Game mode filter">
        <span className={LABEL}>Game mode</span>
        <div className="flex gap-2">
          {(["hardcore", "softcore"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={state.gameMode === m}
              className="d2-btn px-3 py-1.5 text-sm"
              onClick={() => state.gameMode !== m && onChange((s) => ({ ...s, gameMode: m }))}
            >
              {m === "hardcore" ? "Hardcore" : "Softcore"}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Class">
        <span className={LABEL}>Class</span>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {CLASS_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={draft.className === c}
              className="d2-btn px-3 py-1.5 text-sm"
              onClick={() => draft.className !== c && setDraft({ ...draft, className: c, skills: [] })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {presets.length > 0 && (
        <div role="group" aria-label="Presets">
          <span className={LABEL}>Build preset</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const on = isPresetActive(names, p);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  title={`${p.name}, tier ${p.tier}`}
                  className={cn(
                    "flex items-stretch overflow-hidden rounded-sm text-xs transition",
                    on ? "border border-[#5e4a1f] shadow-[inset_0_1px_0_rgba(255,212,122,0.5),0_0_10px_rgba(201,160,75,0.3)]" : "border border-[#7a5e29] hover:border-[#c9a04b]",
                  )}
                  onClick={() => setDraft({ ...draft, skills: on ? [] : p.skills.map((name) => ({ name, minLevel: PRESET_MIN_LEVEL })) })}
                >
                  <span className={cn("flex items-center justify-center px-1.5 font-bold tracking-tight", tierSquareClass(p.tier))}>{p.tier}</span>
                  <span
                    className={cn(
                      "px-2.5 py-1 font-medium tracking-wider",
                      on
                        ? "text-[#0a0604] bg-gradient-to-b from-[#dfb55a] to-[#a07a30]"
                        : "text-[#f5e3b5] bg-gradient-to-b from-[#5a3f24] to-[#382514] hover:from-[#6e4f30] hover:to-[#4a3220] hover:text-[#ffd47a]",
                    )}
                  >
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="meta-min-level" className={LABEL}>
          Min character level: <span className="rarity-unique font-semibold tabular-nums">{draft.minLevel}</span>
        </label>
        <input
          id="meta-min-level"
          type="range"
          min={80}
          max={99}
          step={1}
          value={draft.minLevel}
          aria-valuetext={`Level ${draft.minLevel}+`}
          onChange={(e) => setDraft({ ...draft, minLevel: Number(e.target.value) })}
          className="lx-range"
          style={{ "--fill": `${((draft.minLevel - 80) / 19) * 100}%` } as CSSProperties}
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-ink/70 tabular-nums" aria-hidden>
          <span>80</span>
          <span>90</span>
          <span>99</span>
        </div>
      </div>

      <div>
        <span className={LABEL}>Skills</span>
        {draft.skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {draft.skills.map((sk) => (
              <span
                key={sk.name}
                className="inline-flex items-center gap-2 rounded-sm pl-1.5 pr-1 py-1 text-sm font-semibold border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.4)]"
                style={{ background: "linear-gradient(180deg, #dfb55a 0%, #a07a30 100%)" }}
              >
                <SkillIcon name={sk.name} size={20} />
                <span>{sk.name}</span>
                <span className="text-xs opacity-70">≥</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={sk.minLevel}
                  aria-label={`Minimum hard points for ${sk.name}`}
                  onChange={(e) => setPoints(sk.name, Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  className="w-10 bg-transparent border-0 text-center text-xs outline-none tabular-nums font-bold"
                />
                <button
                  type="button"
                  aria-label={`Remove ${sk.name}`}
                  className="w-5 h-5 flex items-center justify-center rounded-sm hover:bg-[#a52a2a] hover:text-[#f0d9a8] transition"
                  onClick={() => toggleSkill(sk.name)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {skillsError && (
          <div role="alert" className="flex items-center gap-3 text-sm text-[#ff6464]">
            <span>Could not load the skills.</span>
            <button type="button" className="d2-btn px-2 py-0.5 text-xs" aria-label="Retry skills" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}
        {skillsLoading && skillList.length === 0 && <p className="text-sm text-muted-ink italic">Consulting the Tomes…</p>}
        {!skillsError && skillList.length > 0 && (
          <div
            className={cn("max-h-60 overflow-y-auto rounded-sm border border-[#7a5e29] text-sm transition-opacity duration-150", skillsLoading ? "opacity-60" : "opacity-100")}
            style={{
              background: "linear-gradient(180deg, #4a3320 0%, #38241290 100%), #3a2615",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(201,160,75,0.08)",
            }}
          >
            {skillList.map((sk, i) => {
              const on = selected.has(sk.name);
              return (
                <button
                  key={sk.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSkill(sk.name)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors",
                    i > 0 && "border-t border-[#5e4a1f]/40",
                    on ? "font-semibold text-[#0a0604]" : "text-[#f0d9a8] hover:text-[#ffd47a] hover:bg-[rgba(201,160,75,0.12)]",
                  )}
                  style={
                    on
                      ? { background: "linear-gradient(90deg, #dfb55a 0%, #a07a30 100%)", borderLeft: "3px solid #ffd47a", paddingLeft: "9px", boxShadow: "inset 0 1px 0 rgba(255,212,122,0.4)" }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <SkillIcon name={sk.name} size={26} />
                    <span className="truncate">{sk.name}</span>
                  </span>
                  <span className={cn("text-xs tabular-nums shrink-0 ml-2", on ? "text-[#0a0604]/70 font-semibold" : "text-[#c9a04b]")}>{sk.pct.toFixed(0)}%</span>
                </button>
              );
            })}
          </div>
        )}
        {!skillsLoading && !skillsError && draft.skills.length === 0 && (
          <p className="text-xs text-muted-ink mt-2 italic">Pick a class, pick 1-3 skills and hit Generate.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="d2-btn-gold w-full sm:w-auto px-5 py-2 text-sm">
          Generate
        </button>
        <button type="button" onClick={reset} className="text-xs uppercase tracking-wider text-muted-ink hover:text-[#ffd47a] underline underline-offset-2 transition">
          Reset
        </button>
      </div>
    </form>
  );
}
