"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { getSkillUsage, type SkillUsageRow } from "@/lib/api";
import type { UiState } from "@/lib/url-state";
import type { SkillRequirement } from "@/lib/filter";

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

  // Fetch skill list for the active class.
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
          // Sort by pct descending
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

  return (
    <div className="space-y-5 rounded-lg border p-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={s.mode === "guide" ? "default" : "outline"}
          size="sm"
          onClick={() => setS({ ...s, mode: "guide" })}
        >
          Build a guide
        </Button>
        <Button
          variant={s.mode === "diff" ? "default" : "outline"}
          size="sm"
          onClick={() => setS({ ...s, mode: "diff" })}
        >
          Diff my character
        </Button>
      </div>

      {s.mode === "diff" && (
        <Input
          placeholder="Character name or account name"
          value={s.diffName}
          onChange={(e) => setS({ ...s, diffName: e.target.value })}
        />
      )}

      {/* Game mode */}
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Game mode
        </label>
        <div className="flex gap-2">
          <Button
            variant={s.filter.gameMode === "hardcore" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setS({ ...s, filter: { ...s.filter, gameMode: "hardcore" } })
            }
          >
            Hardcore
          </Button>
          <Button
            variant={s.filter.gameMode === "softcore" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setS({ ...s, filter: { ...s.filter, gameMode: "softcore" } })
            }
          >
            Softcore
          </Button>
        </div>
      </div>

      {/* Class selector */}
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Class
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {CLASSES.map((c) => (
            <Button
              key={c}
              variant={s.filter.className === c ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setS({
                  ...s,
                  filter: { ...s.filter, className: c },
                  skills: [],
                })
              }
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Min level */}
      <div>
        <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Min character level:{" "}
          <span className="font-semibold text-foreground">
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
        <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Affix-mod sample:{" "}
          <span className="font-semibold text-foreground">
            {samplePages * 50}
          </span>{" "}
          raw chars
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
        <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Skills{" "}
          <span className="normal-case">
            (filters affix mods + charms — server aggregates use class only)
          </span>
        </label>

        {/* Selected skills as chips */}
        {s.skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {s.skills.map((sk) => (
              <Badge
                key={sk.name}
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-0.5 h-auto"
              >
                <span>{sk.name}</span>
                <span className="text-xs">≥</span>
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
                  className="w-10 bg-transparent border-0 text-center text-xs outline-none"
                />
                <button
                  type="button"
                  className="px-1 hover:bg-destructive hover:text-destructive-foreground rounded"
                  onClick={() => toggleSkill(sk.name)}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Skill picker list */}
        {skillsError && (
          <p className="text-sm text-rose-700">{skillsError}</p>
        )}
        {skillsLoading && (
          <p className="text-sm text-muted-foreground">Loading skills…</p>
        )}
        {!skillsLoading && !skillsError && skillList.length > 0 && (
          <div className="max-h-60 overflow-y-auto rounded border divide-y text-sm">
            {skillList.map((sk) => {
              const selected = selectedSkillNames.has(sk.name);
              return (
                <button
                  key={sk.name}
                  type="button"
                  onClick={() => toggleSkill(sk.name)}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left ${
                    selected ? "bg-accent" : "hover:bg-muted"
                  }`}
                >
                  <span>{sk.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {sk.pct.toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!skillsLoading && !skillsError && s.skills.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No skill filters — all class characters at minLevel will be sampled.
          </p>
        )}
      </div>

      <Button
        onClick={() => onSubmit(s, samplePages)}
        className="w-full sm:w-auto"
      >
        Generate Guide
      </Button>
    </div>
  );
}
