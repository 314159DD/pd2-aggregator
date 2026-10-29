"use client";

import { useState } from "react";
import { Bar } from "@/components/lx/Bar";
import { Button } from "@/components/lx/Button";
import { ItemIcon, SkillIcon } from "@/components/builds/ItemIcon";
import { formatCount, formatPct } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { MetaCohort, SkillUsageEntry } from "@/lib/meta/types";
import { Empty, MetaCard, cap, fin } from "./shared";

const LEVELS = Array.from({ length: 20 }, (_, i) => 80 + i);
const TICKS = [80, 85, 90, 95, 99];

function SkillRow({ name, pct, line, note, edge }: { name: string; pct: number; line: string; note?: string; edge?: boolean }) {
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-2.5 py-1.5"
      style={edge ? { boxShadow: "inset 2px 0 0 var(--accent-text)" } : undefined}
    >
      <SkillIcon name={name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-ink">{name}</span>
          <span className="shrink-0 font-mono text-xs text-ink tabular-nums">{line}</span>
        </div>
        <Bar pct={pct} />
        {note && <span className="text-[11px] text-muted-ink">{note}</span>}
      </div>
    </li>
  );
}

function Skills({ meta }: { meta: MetaCohort }) {
  const [syn, setSyn] = useState(false);
  const [pre, setPre] = useState(false);
  const usage = meta.skillUsage;

  if (!Array.isArray(usage)) {
    const rows = meta.skillFrequency ?? [];
    return rows.length === 0 ? (
      <Empty>No skill data for this cohort.</Empty>
    ) : (
      <ul className="flex flex-col gap-1">
        {rows.slice(0, 20).map((r) => (
          <SkillRow key={r.name} name={r.name} pct={fin(r.pct)} line={formatPct(fin(r.pct))} />
        ))}
      </ul>
    );
  }

  const byPct = (a: SkillUsageEntry, b: SkillUsageEntry) => fin(b.pctAtTwenty) - fin(a.pctAtTwenty);
  const at20 = usage.filter((u) => u.numAtTwenty > 0).sort(byPct);
  const core = at20.filter((u) => u.role === "core");
  const synergies = at20.filter((u) => u.role !== "core");
  const prereqs = usage
    .filter((u) => u.numAtTwenty === 0 && u.numAsPrereq > 0)
    .sort((a, b) => b.numAsPrereq - a.numAsPrereq);

  const row = (u: SkillUsageEntry, edge?: boolean) => (
    <SkillRow
      key={u.name}
      name={u.name}
      pct={fin(u.pctAtTwenty) * 100}
      edge={edge}
      line={`20+ on ${formatPct(fin(u.pctAtTwenty) * 100)}`}
      note={`any points ${formatPct(fin(u.pctAny) * 100)} · avg ${Math.round(fin(u.avgBaseLevel))}`}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">Core skills</h3>
      {core.length === 0 ? (
        <Empty>No core skills at level 20 yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-1">{core.map((u, i) => row(u, i < 3))}</ul>
      )}
      <div className="flex flex-wrap gap-2">
        {synergies.length > 0 && (
          <Button size="sm" variant="ghost" aria-expanded={syn} onClick={() => setSyn(!syn)}>
            {`Show synergies (${synergies.length})`}
          </Button>
        )}
        {prereqs.length > 0 && (
          <Button size="sm" variant="ghost" aria-expanded={pre} onClick={() => setPre(!pre)}>
            {`Show prerequisites (${prereqs.length})`}
          </Button>
        )}
      </div>
      {syn && <ul className="flex flex-col gap-1">{synergies.map((u) => row(u))}</ul>}
      {pre && (
        <ul className="flex flex-col gap-1">
          {prereqs.map((u) => (
            <SkillRow
              key={u.name}
              name={u.name}
              pct={fin(u.pctAny) * 100}
              line={`prereq for ${formatCount(fin(u.numAsPrereq))}`}
              note={`any points ${formatPct(fin(u.pctAny) * 100)} · avg ${Math.round(fin(u.avgBaseLevel))}`}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LevelChart({ data }: { data: MetaCohort["levelDistribution"] }) {
  const counts = new Map((data ?? []).map((d) => [d.level, fin(d.count)]));
  const vals = LEVELS.map((l) => counts.get(l) ?? 0);
  const max = Math.max(...vals);
  const mode = LEVELS[vals.indexOf(max)];
  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={`Level 80 to 99 distribution, most at ${mode}`} className="flex h-24 items-end gap-1">
        {LEVELS.map((l, i) => (
          <div key={l} className="flex h-full flex-1 items-end" title={`Level ${l}: ${formatCount(vals[i])}`}>
            <div
              className="w-full rounded-t-sm"
              style={{
                height: `${max > 0 ? Math.max(vals[i] > 0 ? 3 : 0, (vals[i] / max) * 100) : 0}%`,
                background: "color-mix(in oklab, var(--glow) 22%, transparent)",
                boxShadow: l === mode ? "inset 0 2px 0 var(--accent-text)" : undefined,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1" aria-hidden>
        {LEVELS.map((l) => (
          <span key={l} className="flex-1 text-center font-mono text-[10px] text-muted-ink tabular-nums">
            {TICKS.includes(l) ? l : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Merc({ merc }: { merc: MetaCohort["mercenary"] }) {
  const types = merc?.typeFrequency ?? [];
  if (!merc || !merc.topType || types.length === 0) return <Empty>No mercenary data for this cohort.</Empty>;
  const act = types.find((t) => t.mercType === merc.topType)?.act ?? null;
  const slots = Object.entries(merc.topItemsBySlot ?? {}).filter(([, rows]) => rows.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="well flex flex-col gap-0.5 self-start rounded-xl px-3 py-2">
        <span className="text-xs text-muted-ink">Top type</span>
        <span className="text-base font-medium text-ink">{merc.topType}</span>
        {act !== null && <span className="text-xs text-muted-ink">{`Act ${act}`}</span>}
      </div>
      <ul className="flex flex-col">
        {types.slice(0, 5).map((t) => (
          <li key={t.mercType} className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] py-1.5 first:border-t-0">
            <span className="text-sm text-ink">{t.mercType}</span>
            <span className="font-mono text-xs text-ink tabular-nums">{formatPct(fin(t.pct))}</span>
          </li>
        ))}
      </ul>
      {slots.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-ink">Mercenary items</h4>
          {slots.map(([slot, rows]) => (
            <section key={slot} aria-label={`Merc ${slot}`} className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-ink">{cap(slot)}</span>
              {rows.slice(0, 3).map((it) => (
                <div key={`${it.itemType}-${it.itemName}`} className="flex items-center gap-2.5">
                  <ItemIcon item={{ name: it.itemName, itemType: it.itemType, invCode: it.invCode }} />
                  <span className={`min-w-0 flex-1 truncate text-sm ${qualityClass(it.itemType)}`}>{it.itemName}</span>
                  <span className="font-mono text-xs text-ink tabular-nums">{formatPct(fin(it.pct))}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function BuildSheetCard({ meta }: { meta: MetaCohort }) {
  if (meta.poolSize === 0) {
    return (
      <MetaCard title="Build sheet" className="lg:col-span-12">
        <Empty>No characters match, so there is no build sheet yet.</Empty>
      </MetaCard>
    );
  }
  return (
    <MetaCard title="Build sheet" caption="Skill points, levels and mercenaries of the cohort." className="lg:col-span-12">
      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-label="Skills" className="lg:col-span-6">
          <Skills meta={meta} />
        </section>
        <div className="flex flex-col gap-6 lg:col-span-6">
          <section aria-label="Level distribution" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">Levels</h3>
            <LevelChart data={meta.levelDistribution} />
          </section>
          <section aria-label="Mercenary" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">Mercenary</h3>
            <Merc merc={meta.mercenary} />
          </section>
        </div>
      </div>
    </MetaCard>
  );
}
