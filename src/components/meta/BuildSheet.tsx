"use client";

import { useState } from "react";
import type { MetaCohort, SkillUsageEntry } from "@/lib/meta/types";
import { formatCount } from "@/lib/builds/format";
import { fin } from "./shared";

export function BuildSheet({ meta }: { meta: MetaCohort }) {
  const usage = meta.skillUsage;
  const merc = meta.mercenary;
  const slots = Object.entries(merc?.topItemsBySlot ?? {}).filter(([, rows]) => rows.length > 0);
  return (
    <div className="space-y-5">
      <div className="d2-slot-block" role="group" aria-label="Skills">
        {Array.isArray(usage) && usage.length > 0 ? <SkillFrequencyClassified rows={usage} /> : <SkillFrequencyLegacy rows={meta.skillFrequency ?? []} />}
      </div>

      <hr className="d2-rule" />

      <div className="d2-slot-block" role="group" aria-label="Level distribution">
        <h3 className="d2-sublabel mb-2">Level distribution</h3>
        <LevelDistributionChart buckets={meta.levelDistribution ?? []} />
      </div>

      <hr className="d2-rule" />

      <div className="d2-slot-block" role="group" aria-label="Mercenary">
        <h3 className="d2-sublabel mb-2">Mercenary</h3>
        <div className="text-sm mb-2">
          <span className="text-muted-ink">Top type: </span>
          <span className="rarity-unique font-semibold">{merc?.topType || "—"}</span>
        </div>
        {slots.length > 0 && (
          <div className="space-y-1">
            {slots.map(([slot, items]) => (
              <div key={slot} className="text-sm flex items-baseline gap-2">
                <span className="d2-sublabel w-16 shrink-0 text-[10px]">{slot}</span>
                <span>
                  {items.slice(0, 3).map((it, i) => (
                    <span key={`${it.itemType}-${it.itemName}`} className="rarity-unique">
                      {i > 0 && <span className="text-muted-ink">, </span>}
                      {it.itemName} <span className="text-muted-ink tabular-nums text-xs">({fin(it.pct).toFixed(0)}%)</span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkillFrequencyClassified({ rows }: { rows: SkillUsageEntry[] }) {
  const [showSynergies, setShowSynergies] = useState(false);
  const [showPrereqs, setShowPrereqs] = useState(false);

  // 20 hard points is the "this is the build" mark, the same threshold pd2.tools/builds uses.
  const allBuildRows = rows.filter((r) => r.numAtTwenty > 0).sort((a, b) => fin(b.pctAtTwenty) - fin(a.pctAtTwenty));
  const coreRows = allBuildRows.filter((r) => r.role === "core");
  const synergyRows = allBuildRows.filter((r) => r.role !== "core");
  const prereqOnlyRows = rows.filter((r) => r.numAtTwenty === 0 && r.numAsPrereq > 0).sort((a, b) => b.numAsPrereq - a.numAsPrereq);

  const display = [...(showSynergies ? allBuildRows : coreRows), ...(showPrereqs ? prereqOnlyRows : [])];
  const topCoreNames = new Set(coreRows.slice(0, 3).map((r) => r.name));

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <h3 className="d2-sublabel">Core skills</h3>
        <div className="flex gap-3">
          {synergyRows.length > 0 && (
            <button
              type="button"
              aria-expanded={showSynergies}
              onClick={() => setShowSynergies((v) => !v)}
              className="text-xs text-muted-ink hover:text-ink transition underline-offset-2 hover:underline"
            >
              {showSynergies ? `Hide synergies (${synergyRows.length})` : `Show synergies (${synergyRows.length})`}
            </button>
          )}
          {prereqOnlyRows.length > 0 && (
            <button
              type="button"
              aria-expanded={showPrereqs}
              onClick={() => setShowPrereqs((v) => !v)}
              className="text-xs text-muted-ink hover:text-ink transition underline-offset-2 hover:underline"
            >
              {showPrereqs ? `Hide prerequisites (${prereqOnlyRows.length})` : `Show prerequisites (${prereqOnlyRows.length})`}
            </button>
          )}
        </div>
      </div>

      {display.length === 0 ? (
        <p className="text-sm text-muted-ink italic">— no data —</p>
      ) : (
        <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted-ink/70">
              <th className="font-normal text-left pb-1">Skill</th>
              <th className="font-normal text-left pb-1 w-20">Type</th>
              <th className="font-normal text-right pb-1 w-20">
                <span title="Characters with 20+ hard points in this skill.">Chars 20+</span>
              </th>
              <th className="font-normal text-right pb-1 w-16">
                <span className="underline decoration-dotted underline-offset-2 cursor-help" title="% of cohort with 20+ hard points in this skill.">
                  Hard %
                </span>
              </th>
              <th className="font-normal text-right pb-1 w-14">
                <span className="underline decoration-dotted underline-offset-2 cursor-help" title="% of cohort with any base level in this skill (includes 1-pt prereqs).">
                  Any %
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {display.map((sk) => {
              const isPrereqRow = sk.numAtTwenty === 0;
              const isSynergyRow = !isPrereqRow && sk.role !== "core";
              const isTopBuild = topCoreNames.has(sk.name);
              return (
                <tr key={sk.name}>
                  <td className={`py-1 ${isPrereqRow ? "text-muted-ink italic" : isSynergyRow ? "text-muted-ink" : isTopBuild ? "rarity-unique font-semibold" : "text-ink"}`}>{sk.name}</td>
                  <td className="py-1">
                    {isPrereqRow ? (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[#3d2817] text-muted-ink">Prereq</span>
                    ) : isSynergyRow ? (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[#3d2817]/40 text-muted-ink">Synergy</span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-ink">{formatCount(fin(sk.numAtTwenty))}</td>
                  <td className={`py-1 text-right tabular-nums ${isTopBuild ? "font-semibold" : "text-ink"}`}>{(fin(sk.pctAtTwenty) * 100).toFixed(1)}%</td>
                  <td className="py-1 text-right tabular-nums text-muted-ink">{(fin(sk.pctAny) * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-2 text-[10px] text-muted-ink/70 italic">
        Skill classification and prerequisite data from{" "}
        <a href="https://wiki.projectdiablo2.com" target="_blank" rel="noreferrer" className="underline hover:text-ink">
          wiki.projectdiablo2.com
        </a>{" "}
        (CC-BY-SA).
      </p>
    </>
  );
}

function SkillFrequencyLegacy({ rows }: { rows: MetaCohort["skillFrequency"] }) {
  return (
    <>
      <h3 className="d2-sublabel mb-2">Skill frequency</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-ink italic">— no data —</p>
      ) : (
        <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
          <tbody>
            {rows.slice(0, 20).map((sk, i) => (
              <tr key={sk.name}>
                <td className={`py-1 ${i < 3 ? "rarity-unique font-semibold" : "text-ink"}`}>{sk.name}</td>
                <td className="py-1 text-right tabular-nums text-muted-ink pl-3">{formatCount(fin(sk.numOccurrences))}</td>
                <td className="py-1 text-right tabular-nums text-ink w-14">{fin(sk.pct).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function LevelDistributionChart({ buckets }: { buckets: MetaCohort["levelDistribution"] }) {
  const visible = buckets.filter((b) => fin(b.count) > 0);
  if (visible.length === 0) return <p className="text-sm text-muted-ink italic">— no data —</p>;
  const maxCount = Math.max(...visible.map((b) => fin(b.count)));
  const BAR_AREA = 96;
  return (
    <div role="img" aria-label="Level distribution" className="flex gap-1.5 items-end" style={{ height: BAR_AREA + 22 }}>
      {visible.map((b) => {
        const h = maxCount > 0 ? Math.max(3, (fin(b.count) / maxCount) * BAR_AREA) : 0;
        return (
          <div key={b.level} className="group relative flex flex-col items-center justify-end flex-1 min-w-2 cursor-default" style={{ height: "100%" }}>
            <span
              className="absolute left-1/2 -translate-x-1/2 px-1 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] text-[10px] font-semibold tabular-nums text-[#ffd47a] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10"
              style={{ bottom: h + 18 }}
            >
              {formatCount(fin(b.count))}
            </span>
            <div className="w-full max-w-7 rounded-sm bg-[#c9a04b] group-hover:bg-[#dfb55a] transition" style={{ height: h }} />
            <span className="text-[10px] text-muted-ink tabular-nums leading-none mt-1">{b.level}</span>
          </div>
        );
      })}
    </div>
  );
}
