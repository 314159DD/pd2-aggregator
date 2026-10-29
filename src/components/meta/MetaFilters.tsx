"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, buttonClass } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { SearchField } from "@/components/lx/SearchField";
import { Segment } from "@/components/lx/Segment";
import { BUILD_PRESETS, PRESET_MIN_LEVEL, isPresetActive } from "@/lib/buildPresets";
import { classIconUrl } from "@/lib/builds/item-art";
import { CLASS_NAMES } from "@/lib/builds/url-state";
import type { MetaState, MetaUpdate } from "@/lib/meta/state";
import { SkillPicker } from "./SkillPicker";

const RING = { boxShadow: "inset 0 0 0 1.5px var(--accent-text)" } as const;

function DiffSearch({ initial, onCommit }: { initial: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(draft.trim());
      }}
    >
      <label className="flex min-w-60 flex-1 flex-col gap-1.5 text-xs font-medium text-muted-ink">
        Character or account name
        <SearchField type="text" maxLength={50} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <Button type="submit" variant="primary">
        Compare
      </Button>
    </form>
  );
}

function MinLevel({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  // A pending edit overrides the URL value only until the URL value changes.
  const [draft, setDraft] = useState<{ v: number; from: number } | null>(null);
  const v = draft && draft.from === value ? draft.v : value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const label = `Level ${v}+`;
  return (
    <div className="flex max-w-md flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span id="meta-min-level" className="text-xs font-medium text-muted-ink">
          Minimum level
        </span>
        <output className="font-mono text-sm tabular-nums text-accent-text">{label}</output>
      </div>
      <input
        type="range"
        min={80}
        max={99}
        step={1}
        value={v}
        aria-labelledby="meta-min-level"
        aria-valuetext={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft({ v: n, from: value });
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => latest.current(n), 250);
        }}
        className="lx-range"
        style={{ "--fill": `${((v - 80) / 19) * 100}%` } as CSSProperties}
      />
    </div>
  );
}

export function MetaFilters({ state, onChange }: { state: MetaState; onChange: MetaUpdate }) {
  const presets = BUILD_PRESETS[state.className] ?? [];
  const names = state.skills.map((s) => s.name);
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-4">
        <Segment
          className="self-start"
          ariaLabel="View"
          value={state.mode}
          onChange={(v) => onChange((s) => ({ ...s, mode: v === "diff" ? "diff" : "guide" }))}
          items={[
            { value: "guide", label: "Build guide" },
            { value: "diff", label: "Diff my character" },
          ]}
        />
        {state.mode === "diff" && <DiffSearch key={state.char} initial={state.char} onCommit={(char) => onChange((s) => ({ ...s, char }))} />}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-ink">Class</span>
        <div className="flex flex-wrap gap-2">
          {CLASS_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={state.className === c}
              onClick={() => state.className !== c && onChange((s) => (s.className === c ? s : { ...s, className: c, skills: [] }))}
              className={buttonClass("secondary", "sm", "gap-2 pl-1.5")}
              style={state.className === c ? RING : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={classIconUrl(c)} alt="" width={22} height={22} className="size-[22px] rounded-full object-cover" />
              {c}
            </button>
          ))}
        </div>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-ink">Presets</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const on = isPresetActive(names, p);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange((s) => ({ ...s, skills: on ? [] : p.skills.map((name) => ({ name, minLevel: PRESET_MIN_LEVEL })) }))}
                  className={buttonClass("secondary", "sm", "h-[30px] gap-2 pl-1")}
                  style={on ? RING : undefined}
                >
                  <span
                    className="well inline-flex size-[22px] items-center justify-center rounded-md font-mono text-[11px] text-ink-soft"
                    aria-hidden
                  >
                    {p.tier}
                  </span>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <MinLevel value={state.minLevel} onCommit={(minLevel) => onChange((s) => ({ ...s, minLevel }))} />

      <SkillPicker state={state} onChange={onChange} />
    </Card>
  );
}
