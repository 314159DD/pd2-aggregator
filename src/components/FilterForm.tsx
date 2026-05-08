"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { getSkillUsage, type SkillUsageRow } from "@/lib/api";
import type { UiState } from "@/lib/url-state";

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
  onSubmit: (s: UiState, samplePages: number) => void;
};

export function FilterForm({ initial, onSubmit }: Props) {
  const [s, setS] = useState<UiState>(initial);
  const [samplePages, setSamplePages] = useState(5);
  const [skillList, setSkillList] = useState<SkillUsageRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!s.filter.className) {
      setSkillList([]);
      return;
    }
    setSkillsLoading(true);
    setSkillsError(null);
    getSkillUsage({ gameMode: s.filter.gameMode, className: s.filter.className })
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
  }, [s.filter.className, s.filter.gameMode]);

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

  // Active button: gold gradient background with dark text — high contrast.
  // Inactive: lifted warm-stone with parchment text — clearly readable, clearly clickable.
  const pillBtn = (active: boolean) =>
    active
      ? "px-3 py-1.5 text-sm rounded-sm font-bold uppercase tracking-wider border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.5),0_0_10px_rgba(201,160,75,0.3)] bg-gradient-to-b from-[#dfb55a] to-[#a07a30] transition"
      : "px-3 py-1.5 text-sm rounded-sm border border-[#5e4a1f] text-foreground bg-gradient-to-b from-[#3a2615] to-[#241509] hover:from-[#4a3220] hover:to-[#2e1d10] hover:border-[#c9a04b] transition";

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
        <Input
          placeholder="Character name or account name"
          value={s.diffName}
          onChange={(e) => setS({ ...s, diffName: e.target.value })}
          style={{
            background: "linear-gradient(180deg, #1f1409 0%, #2a1d0e 100%)",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)",
          }}
          className="border-[#5e4a1f] focus-visible:border-[#c9a04b] focus-visible:ring-[#c9a04b]/20 text-foreground placeholder:text-muted-foreground/60"
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

      {/* Min level */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Min character level:{" "}
          <span className="rarity-unique font-semibold tabular-nums">
            {s.filter.minLevel ?? 80}
          </span>
        </label>
        <Slider
          min={1}
          max={99}
          value={[s.filter.minLevel ?? 80]}
          onValueChange={(v) =>
            setS({ ...s, filter: { ...s.filter, minLevel: v[0] } })
          }
        />
      </div>

      {/* Sample pages */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Affix-mod sample:{" "}
          <span className="rarity-unique font-semibold tabular-nums">
            {samplePages * 50}
          </span>{" "}
          <span className="normal-case">raw characters</span>
        </label>
        <Slider
          min={1}
          max={10}
          value={[samplePages]}
          onValueChange={(v) => setSamplePages(v[0])}
        />
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
                className="inline-flex items-center gap-1 rounded-sm pl-2 pr-1 py-1 text-sm font-semibold border border-[#5e4a1f] text-[#0a0604] shadow-[inset_0_1px_0_rgba(255,212,122,0.4)]"
                style={{
                  background:
                    "linear-gradient(180deg, #dfb55a 0%, #a07a30 100%)",
                }}
              >
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
                  className={`group flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
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
                  <span>{sk.name}</span>
                  <span
                    className={`text-xs tabular-nums ${
                      selected
                        ? "text-[#0a0604]/70 font-semibold"
                        : "text-[#a08560]"
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
            No skill filters — all {s.filter.className}s at minLevel will be sampled.
          </p>
        )}
      </div>

      <Button
        onClick={() => onSubmit(s, samplePages)}
        className="w-full sm:w-auto bg-gradient-to-b from-[#c9a04b] to-[#8a6f2e] text-[#0a0604] hover:from-[#dfb55a] hover:to-[#a08036] font-bold uppercase tracking-widest border border-[#5e4a1f] shadow-[inset_0_1px_0_rgba(255,212,122,0.4),0_2px_6px_rgba(0,0,0,0.5)]"
      >
        Generate Guide
      </Button>
    </div>
  );
}
