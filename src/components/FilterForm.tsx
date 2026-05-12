"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getSkillUsage, type SkillUsageRow } from "@/lib/api";
import type { UiState } from "@/lib/url-state";
import {
  BUILD_PRESETS,
  PRESET_MIN_LEVEL,
  isPresetActive,
} from "@/lib/buildPresets";

// Icons mirrored from pd2.tools/icons (218 PD2 skill icons, ~970 KB total).
// Self-hosted because the wiki's Special:FilePath redirect drops some skills
// (e.g. Prayer, where the wiki slug doesn't match the skill name 1:1).
// Refresh the mirror on PD2 patches that add or rename skills.
function skillIconUrl(name: string): string {
  return `/icons/${name.replace(/ /g, "_")}.png`;
}

function SkillIcon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={skillIconUrl(name)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        // Hide if the wiki has no matching icon (skill name mismatch, etc.)
        e.currentTarget.style.visibility = "hidden";
      }}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}

const CLASSES = [
  "Amazon",
  "Assassin",
  "Barbarian",
  "Druid",
  "Necromancer",
  "Paladin",
  "Sorceress",
];

type Props = {
  initial: UiState;
  onSubmit: (s: UiState) => void;
};

export function FilterForm({ initial, onSubmit }: Props) {
  const [s, setS] = useState<UiState>(initial);
  const [skillList, setSkillList] = useState<SkillUsageRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  // Refetch the skill list whenever the cohort filter changes. Including
  // s.skills makes the picker behave like pd2.tools/builds: clicking a skill
  // re-aggregates the percentages within "the subset of chars who already
  // have this skill", so the list reads as "what else do Holy-Bolt paladins
  // run?" instead of a static class-wide popularity.
  const skillsKey = s.skills.map((sk) => sk.name).join(",");
  useEffect(() => {
    let cancelled = false;
    if (!s.filter.className) {
      setSkillList([]);
      return;
    }
    setSkillsLoading(true);
    setSkillsError(null);
    getSkillUsage(
      { gameMode: s.filter.gameMode, className: s.filter.className },
      s.skills,
    )
      .then((rows) => {
        if (!cancelled) {
          const sorted = [...rows].sort((a, b) => b.pct - a.pct);
          setSkillList(sorted);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setSkillsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // s.skills is keyed by name only so editing minLevel in a chip doesn't
    // refire the fetch on every keystroke. Min levels still ship to the
    // server when the user hits Generate Guide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.filter.className, s.filter.gameMode, skillsKey]);

  const selectedSkillNames = new Set(s.skills.map((sk) => sk.name));

  function toggleSkill(name: string) {
    if (selectedSkillNames.has(name)) {
      setS({ ...s, skills: s.skills.filter((sk) => sk.name !== name) });
    } else {
      setS({ ...s, skills: [...s.skills, { name, minLevel: 20 }] });
    }
  }

  function setSkillLevel(name: string, level: number) {
    setS({
      ...s,
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, minLevel: level } : sk,
      ),
    });
  }

  const tabBtn = (active: boolean) =>
    `px-3 py-1.5 text-sm uppercase tracking-wider transition ${
      active
        ? "rarity-unique font-semibold border-b-2 border-[#c9a04b]"
        : "text-muted-foreground hover:rarity-unique border-b-2 border-transparent"
    }`;

  // Active: gold gradient bg, near-black text. Inactive: lifted warm-stone bg, bright parchment text.
  const pillBtn = (active: boolean) =>
    active
      ? "px-3 py-1.5 text-sm rounded-sm font-bold uppercase tracking-wider border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.5),0_0_10px_rgba(201,160,75,0.3)] bg-gradient-to-b from-[#dfb55a] to-[#a07a30] transition"
      : "px-3 py-1.5 text-sm rounded-sm border-2 border-[#7a5e29] font-medium text-[#f5e3b5] bg-gradient-to-b from-[#5a3f24] to-[#382514] hover:from-[#6e4f30] hover:to-[#4a3220] hover:border-[#c9a04b] hover:text-[#ffd47a] transition";

  return (
    <div className="d2-panel rounded-sm p-5 space-y-5">
      {/* Mode toggle as tabs */}
      <div className="flex gap-1 border-b border-[#3d2817] -mt-1">
        <button
          type="button"
          className={tabBtn(s.mode === "guide")}
          onClick={() => setS({ ...s, mode: "guide" })}
        >
          Build a guide
        </button>
        <button
          type="button"
          className={tabBtn(s.mode === "diff")}
          onClick={() => setS({ ...s, mode: "diff" })}
        >
          Diff my character
        </button>
      </div>

      {s.mode === "diff" && (
        <input
          type="text"
          placeholder="Character name or account name"
          value={s.diffName}
          onChange={(e) => setS({ ...s, diffName: e.target.value })}
          className="w-full px-3 py-2 rounded-sm border-2 border-[#7a5e29] focus:border-[#c9a04b] outline-none text-[#f5e3b5] placeholder:text-[#a08560]/70 transition"
          style={{
            background: "linear-gradient(180deg, #5a3f24 0%, #382514 100%)",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
          }}
        />
      )}

      {/* Game mode */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Game mode
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className={pillBtn(s.filter.gameMode === "hardcore")}
            onClick={() =>
              setS({ ...s, filter: { ...s.filter, gameMode: "hardcore" } })
            }
          >
            Hardcore
          </button>
          <button
            type="button"
            className={pillBtn(s.filter.gameMode === "softcore")}
            onClick={() =>
              setS({ ...s, filter: { ...s.filter, gameMode: "softcore" } })
            }
          >
            Softcore
          </button>
        </div>
      </div>

      {/* Class selector */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Class
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              className={pillBtn(s.filter.className === c)}
              onClick={() =>
                setS({
                  ...s,
                  filter: { ...s.filter, className: c },
                  skills: [],
                })
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Build presets (only when a class is selected) */}
      {s.filter.className && BUILD_PRESETS[s.filter.className] && (
        <div>
          <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Build preset
          </label>
          <div className="flex flex-wrap gap-2">
            {BUILD_PRESETS[s.filter.className].map((preset) => {
              const active = isPresetActive(
                s.skills.map((sk) => sk.name),
                preset,
              );
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={
                    active
                      ? "px-2.5 py-1 text-xs rounded-sm font-bold uppercase tracking-wider border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.5),0_0_10px_rgba(201,160,75,0.3)] bg-gradient-to-b from-[#dfb55a] to-[#a07a30] transition"
                      : "px-2.5 py-1 text-xs rounded-sm border border-[#7a5e29] font-medium text-[#f5e3b5] bg-gradient-to-b from-[#5a3f24] to-[#382514] hover:from-[#6e4f30] hover:to-[#4a3220] hover:border-[#c9a04b] hover:text-[#ffd47a] transition"
                  }
                  onClick={() =>
                    setS({
                      ...s,
                      skills: preset.skills.map((name) => ({
                        name,
                        minLevel: PRESET_MIN_LEVEL,
                      })),
                    })
                  }
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Min level (capped at 80 — characters below 80 aren't endgame and
          pollute the meta snapshot). */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Min character level:{" "}
          <span className="rarity-unique font-semibold tabular-nums">
            {s.filter.minLevel ?? 80}
          </span>
        </label>
        <Slider
          min={80}
          max={99}
          value={[Math.max(80, s.filter.minLevel ?? 80)]}
          onValueChange={(v) =>
            setS({ ...s, filter: { ...s.filter, minLevel: v[0] } })
          }
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
          <span>80</span>
          <span>90</span>
          <span>99</span>
        </div>
      </div>

      {/* Skills picker */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Skills
        </label>

        {/* Selected skills as chips */}
        {s.skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {s.skills.map((sk) => (
              <span
                key={sk.name}
                className="inline-flex items-center gap-2 rounded-sm pl-1.5 pr-1 py-1 text-sm font-semibold border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.4)]"
                style={{
                  background:
                    "linear-gradient(180deg, #dfb55a 0%, #a07a30 100%)",
                }}
              >
                <SkillIcon name={sk.name} size={20} />
                <span>{sk.name}</span>
                <span className="text-xs opacity-70">≥</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={sk.minLevel}
                  onChange={(e) =>
                    setSkillLevel(
                      sk.name,
                      Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                    )
                  }
                  className="w-10 bg-transparent border-0 text-center text-xs outline-none tabular-nums font-bold"
                />
                <button
                  type="button"
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
          <p className="text-sm text-[#ff6464]">{skillsError}</p>
        )}
        {skillsLoading && (
          <p className="text-sm text-muted-foreground italic">Consulting the Tomes…</p>
        )}
        {!skillsLoading && !skillsError && skillList.length > 0 && (
          <div
            className="max-h-60 overflow-y-auto rounded-sm border border-[#7a5e29] text-sm"
            style={{
              // Clearly LIGHTER than the surrounding panel — reads as a parchment recess.
              background:
                "linear-gradient(180deg, #4a3320 0%, #38241290 100%), #3a2615",
              boxShadow:
                "inset 0 2px 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(201,160,75,0.08)",
            }}
          >
            {skillList.map((sk, i) => {
              const selected = selectedSkillNames.has(sk.name);
              return (
                <button
                  key={sk.name}
                  type="button"
                  onClick={() => toggleSkill(sk.name)}
                  className={`group flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors ${
                    i > 0 ? "border-t border-[#5e4a1f]/40" : ""
                  } ${
                    selected
                      ? "font-semibold text-[#0a0604]"
                      : "text-[#f0d9a8] hover:text-[#ffd47a]"
                  }`}
                  style={
                    selected
                      ? {
                          background:
                            "linear-gradient(90deg, #dfb55a 0%, #a07a30 100%)",
                          borderLeft: "3px solid #ffd47a",
                          paddingLeft: "9px",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,212,122,0.4)",
                        }
                      : undefined
                  }
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background =
                        "rgba(201,160,75,0.12)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <SkillIcon name={sk.name} size={26} />
                    <span className="truncate">{sk.name}</span>
                  </span>
                  <span
                    className={`text-xs tabular-nums shrink-0 ml-2 ${
                      selected
                        ? "text-[#0a0604]/70 font-semibold"
                        : "text-[#c9a04b]"
                    }`}
                  >
                    {sk.pct.toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!skillsLoading && !skillsError && s.skills.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Pick a class, pick 1-3 skills and hit Generate.
          </p>
        )}
      </div>

      <Button
        onClick={() => onSubmit(s)}
        className="w-full sm:w-auto bg-gradient-to-b from-[#c9a04b] to-[#8a6f2e] text-[#0a0604] hover:from-[#dfb55a] hover:to-[#a08036] font-bold uppercase tracking-widest border border-[#5e4a1f] shadow-[inset_0_1px_0_rgba(255,212,122,0.4),0_2px_6px_rgba(0,0,0,0.5)]"
      >
        Generate
      </Button>
    </div>
  );
}
