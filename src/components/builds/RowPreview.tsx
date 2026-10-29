"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/lx/Button";
import { getPreview } from "@/lib/builds/api";
import { formatCount, formatHr } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { Scope } from "@/lib/builds/scope";
import type { CharacterPreview, PreviewItem } from "@/lib/builds/types";
import { ItemIcon, SkillIcon } from "./ItemIcon";

export type PreviewCache = Map<string, CharacterPreview | null>;

type Status = { name: string; preview: CharacterPreview | null; failed: boolean } | null;

const MAX_BAR = 20;

function SkillBar({ hard, real, max }: { hard: number; real: number; max: number }) {
  const hardPct = Math.min(100, (hard / max) * 100);
  const bonusPct = Math.min(100 - hardPct, (Math.max(0, real - hard) / max) * 100);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-well" aria-hidden data-testid="skill-bar">
      <div data-testid="skill-hard" className="h-full" style={{ width: `${hardPct}%`, background: "var(--glow)" }} />
      <div className="h-full" style={{ width: `${bonusPct}%`, background: "color-mix(in oklab, var(--glow) 40%, transparent)" }} />
    </div>
  );
}

function ItemLine({ item }: { item: PreviewItem }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5">
      <ItemIcon item={item} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span title={item.name} className={`min-w-0 truncate text-sm ${qualityClass(item.itemType)}`}>{item.name}</span>
        {item.isSwitch && <span className="shrink-0 text-xs text-ink-soft">switch</span>}
      </span>
      {item.medianHr !== null && (
        <span className="shrink-0 rounded-full bg-well px-2 py-0.5 font-mono text-xs text-ink tabular-nums">
          {formatHr(item.medianHr)} HR
        </span>
      )}
    </li>
  );
}

function Column({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <h3 className="flex items-baseline gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
        {title}
        {caption && <span className="font-normal tracking-normal normal-case">{caption}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Inline preview of one character: skills, gear, stats and mercenary. Fetched once per mount unless cached. */
export function RowPreview({ name, scope, cache }: { name: string; scope: Scope; cache?: PreviewCache }) {
  const [status, setStatus] = useState<Status>(null);
  const { season, gameMode } = scope;

  useEffect(() => {
    if (cache?.has(name)) {
      setStatus({ name, preview: cache.get(name) ?? null, failed: cache.get(name) == null });
      return;
    }
    const ac = new AbortController();
    getPreview(name, { season, gameMode }, ac.signal)
      .then((p) => {
        if (ac.signal.aborted) return;
        cache?.set(name, p);
        setStatus({ name, preview: p, failed: p === null });
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setStatus({ name, preview: null, failed: true });
      });
    return () => ac.abort();
  }, [name, season, gameMode, cache]);

  const done = status !== null && status.name === name;
  const href = `/builds/character?name=${encodeURIComponent(name)}${season === null ? "" : `&season=${season}`}&gameMode=${gameMode}`;

  if (!done) {
    return (
      <div className="grid gap-5 p-5 md:grid-cols-3" aria-busy="true" aria-label="Loading character">
        {[0, 1, 2].map((c) => (
          <div key={c} className="flex flex-col gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <div key={r} className="skelett h-7 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (status.failed || status.preview === null) {
    return <p role="alert" className="p-5 text-sm text-danger">Could not load this character.</p>;
  }

  const p = status.preview;
  const maxSkill = Math.max(MAX_BAR, ...p.skills.slice(0, 10).map((s) => s.realLevel ?? s.hardLevel));
  const gear = p.gear.filter((g) => !g.isCharm);
  const stats: Array<[string, number | null]> = [
    ["Life", p.life],
    ["Mana", p.mana],
    ["Str", p.attributes.strength],
    ["Dex", p.attributes.dexterity],
    ["Vit", p.attributes.vitality],
    ["Ene", p.attributes.energy],
  ];

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid gap-6 md:grid-cols-3">
        <Column title="Skills">
          <ul className="flex flex-col gap-2">
            {p.skills.slice(0, 10).map((s) => {
              const real = s.realLevel ?? s.hardLevel;
              return (
                <li key={s.name} className="flex min-w-0 items-center gap-2.5">
                  <SkillIcon name={s.name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span title={s.name} className="truncate text-sm text-ink">{s.name}</span>
                    <SkillBar hard={s.hardLevel} real={real} max={maxSkill} />
                  </div>
                  <span className="shrink-0 font-mono text-sm text-ink tabular-nums">
                    {real}
                    {real !== s.hardLevel && <span className="ml-1 text-xs text-ink-soft">{s.hardLevel}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Column>

        <Column title="Gear">
          {gear.length === 0 ? (
            <p className="text-sm text-ink-soft">-</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gear.map((g, i) => (
                <ItemLine key={`${g.name}-${i}`} item={g} />
              ))}
            </ul>
          )}
        </Column>

        <div className="flex min-w-0 flex-col gap-5">
          <Column title="Stats">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {stats.map(([label, v]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-ink-soft">{label}</dt>
                  <dd className="font-mono text-sm text-ink tabular-nums">{v === null ? "-" : formatCount(v)}</dd>
                </div>
              ))}
            </dl>
          </Column>
          {p.merc && (
            <Column title={`Merc · ${p.merc.type}`} caption={p.merc.act === null ? undefined : `Act ${p.merc.act}`}>
              {p.merc.items.length === 0 ? (
                <p className="text-sm text-ink-soft">-</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {p.merc.items.map((g, i) => (
                    <ItemLine key={`${g.name}-${i}`} item={g} />
                  ))}
                </ul>
              )}
            </Column>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <a href={href} className={buttonClass("secondary", "sm")}>
          Full character ›
        </a>
      </div>
    </div>
  );
}
