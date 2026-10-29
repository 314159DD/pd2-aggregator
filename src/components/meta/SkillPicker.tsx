"use client";

import { useEffect, useState } from "react";
import { Bar } from "@/components/lx/Bar";
import { Button } from "@/components/lx/Button";
import { Chip } from "@/components/lx/Chip";
import { SearchField } from "@/components/lx/SearchField";
import { SkillIcon } from "@/components/builds/ItemIcon";
import { getSkillUsage, type SkillUsageRow } from "@/lib/api";
import { formatCount, formatPct } from "@/lib/builds/format";
import type { MetaState } from "@/lib/meta/state";

const TOP = 12;
const DEFAULT_POINTS = 20;

function Points({ name, value, onCommit }: { name: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = Math.trunc(Number(draft));
    if (!Number.isFinite(n) || draft.trim() === "") return setDraft(String(value));
    const c = Math.min(99, Math.max(1, n));
    setDraft(String(c));
    if (c !== value) onCommit(c);
  };
  return (
    <input
      type="number"
      min={1}
      max={99}
      value={draft}
      aria-label={`Minimum hard points for ${name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-9 bg-transparent text-center font-mono text-xs tabular-nums text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent-text"
    />
  );
}

export function SkillPicker({ state, onChange }: { state: MetaState; onChange: (next: MetaState) => void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<{ key: string; rows: SkillUsageRow[] } | null>(null);

  const { gameMode, className, minLevel, skills } = state;
  const key = `${gameMode}|${className}|${minLevel}|${skills.map((s) => s.name).join(",")}`;
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      getSkillUsage({ gameMode, className, minLevel }, skills, ac.signal)
        .then((r) => !ac.signal.aborted && setRows({ key, rows: r }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // `key` is the identity of gameMode, className, minLevel and the skill names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const data = rows?.rows ?? [];
  const q = query.trim().toLowerCase();
  const matches = q ? data.filter((r) => r.name.toLowerCase().includes(q)) : data;
  const shown = all || q ? matches : matches.slice(0, TOP);
  const selected = new Set(skills.map((s) => s.name));

  const toggle = (name: string) =>
    onChange({
      ...state,
      skills: selected.has(name) ? skills.filter((s) => s.name !== name) : [...skills, { name, minLevel: DEFAULT_POINTS }],
    });
  const setPoints = (name: string, n: number) =>
    onChange({ ...state, skills: skills.map((s) => (s.name === name ? { ...s, minLevel: n } : s)) });

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-ink">Skills</span>
      {skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {skills.map((s) => (
            <Chip key={s.name} onRemove={() => toggle(s.name)} removeLabel={`Remove ${s.name}`}>
              <span className="text-ink">{s.name}</span>
              <span className="inline-flex items-center rounded-full bg-paper/40 px-1">
                <Points key={s.minLevel} name={s.name} value={s.minLevel} onCommit={(n) => setPoints(s.name, n)} />
                <span aria-hidden className="font-mono text-xs">
                  +
                </span>
              </span>
            </Chip>
          ))}
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...state, skills: [] })}>
            Clear skills
          </Button>
        </div>
      )}
      <SearchField type="search" placeholder="Search skills..." aria-label="Search skills" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!rows ? (
        <div className="skelett h-24 rounded-[var(--radius-box)]" />
      ) : shown.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-soft">No matches</p>
      ) : (
        <ul className="grid gap-1 md:grid-cols-2">
          {shown.map((r) => {
            const on = selected.has(r.name);
            return (
              <li key={r.name}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(r.name)}
                  className="drueckbar flex min-h-9 w-full items-center gap-2.5 rounded-xl px-2.5 py-1 text-left text-sm outline-none hover:bg-well focus-visible:outline-2 focus-visible:outline-accent-text"
                  style={on ? { boxShadow: "inset 2px 0 0 var(--accent-text)" } : undefined}
                >
                  <SkillIcon name={r.name} />
                  <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
                  <Bar pct={r.pct} className="w-16" />
                  <span className="w-10 text-right font-mono text-xs text-ink-soft tabular-nums">{formatPct(r.pct)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!q && matches.length > TOP && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? `Show top ${TOP}` : `Show all ${formatCount(matches.length)}`}
        </Button>
      )}
    </div>
  );
}
