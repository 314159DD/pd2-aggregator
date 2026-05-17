"use client";
import { useState } from "react";
import type { BuildSheet as BuildSheetData } from "@/lib/shape/buildSheet";
import type { SkillUsageEntry } from "@/lib/aggregate";
import skillClassificationRaw from "../../data/skill-classification.json";
import { ItemTooltip, useItemsData } from "./ItemTooltip";

type SkillRole = "core" | "synergy";
const SKILL_CLASSIFICATION = skillClassificationRaw as Record<
  string,
  Record<string, SkillRole>
>;

export function BuildSheet({
  data,
  skillUsage,
  className,
}: {
  data: BuildSheetData;
  /** Prereq-classified skill usage. When present, replaces the server-side
   *  `data.skillFrequency` table and unlocks the "Show prerequisites" toggle. */
  skillUsage?: SkillUsageEntry[] | null;
  /** Character class — drives the Core/Synergy classification lookup. */
  className?: string;
}) {
  const itemsData = useItemsData();
  return (
    <div className="space-y-5">
      {/* Skills */}
      <div className="d2-slot-block">
        {skillUsage && skillUsage.length > 0 ? (
          <SkillFrequencyClassified
            rows={skillUsage}
            className={className}
          />
        ) : (
          <SkillFrequencyLegacy rows={data.skillFrequency} />
        )}
      </div>

      <hr className="d2-rule" />

      {/* Level distribution */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Level distribution</h3>
        <LevelDistributionChart buckets={data.levelDistribution} />
      </div>

      <hr className="d2-rule" />

      {/* Mercenary */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Mercenary</h3>
        <div className="text-sm mb-2">
          <span className="text-muted-foreground">Top type: </span>
          <span className="rarity-unique font-semibold">
            {data.mercenary.topType || "—"}
          </span>
        </div>
        {Object.entries(data.mercenary.topItemsBySlot).length > 0 && (
          <div className="space-y-1">
            {Object.entries(data.mercenary.topItemsBySlot).map(
              ([slot, items]) => (
                <div key={slot} className="text-sm flex items-baseline gap-2">
                  <span className="d2-sublabel w-16 shrink-0 text-[10px]">
                    {slot}
                  </span>
                  <span>
                    {items.map((it, i) => (
                      <span key={it.itemName} className="rarity-unique">
                        {i > 0 && (
                          <span className="text-muted-foreground">, </span>
                        )}
                        <ItemTooltip name={it.itemName} itemsData={itemsData}>
                          {it.itemName}
                        </ItemTooltip>{" "}
                        <span className="text-muted-foreground tabular-nums text-xs">
                          ({it.pct.toFixed(0)}%)
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill frequency — classified (prereq-aware) variant
// ---------------------------------------------------------------------------

function SkillFrequencyClassified({
  rows,
  className,
}: {
  rows: SkillUsageEntry[];
  className?: string;
}) {
  const [showSynergies, setShowSynergies] = useState(false);
  const [showPrereqs, setShowPrereqs] = useState(false);

  const classMap = className ? SKILL_CLASSIFICATION[className] ?? {} : {};
  const roleOf = (name: string): SkillRole => classMap[name] ?? "core";

  // 20-hard-point threshold matches pd2.tools/builds.
  const allBuildRows = rows
    .filter((r) => r.numAtTwenty > 0)
    .sort((a, b) => b.pctAtTwenty - a.pctAtTwenty);

  const coreRows = allBuildRows.filter((r) => roleOf(r.name) === "core");
  const synergyRows = allBuildRows.filter((r) => roleOf(r.name) === "synergy");

  // Prereqs: skills no one builds, but commonly taken as 1-pt prereqs.
  const prereqOnlyRows = rows.filter(
    (r) => r.numAtTwenty === 0 && r.numAsPrereq > 0,
  );

  const visibleBuildRows = showSynergies ? allBuildRows : coreRows;
  const display = [
    ...visibleBuildRows,
    ...(showPrereqs ? prereqOnlyRows : []),
  ];

  const topCoreNames = new Set(coreRows.slice(0, 3).map((r) => r.name));

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <h3 className="d2-sublabel">Core skills</h3>
        <div className="flex gap-3">
          {synergyRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSynergies((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition underline-offset-2 hover:underline"
            >
              {showSynergies
                ? `Hide synergies (${synergyRows.length})`
                : `Show synergies (${synergyRows.length})`}
            </button>
          )}
          {prereqOnlyRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPrereqs((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition underline-offset-2 hover:underline"
            >
              {showPrereqs
                ? `Hide prerequisites (${prereqOnlyRows.length})`
                : `Show prerequisites (${prereqOnlyRows.length})`}
            </button>
          )}
        </div>
      </div>

      {display.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">— no data —</p>
      ) : (
        <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              <th className="font-normal text-left pb-1">Skill</th>
              <th className="font-normal text-left pb-1 w-20">Type</th>
              <th className="font-normal text-right pb-1 w-20">
                <span title="Characters with 20+ hard points in this skill (matches pd2.tools/builds threshold).">
                  Chars 20+
                </span>
              </th>
              <th className="font-normal text-right pb-1 w-16">
                <span
                  className="underline decoration-dotted underline-offset-2 cursor-help"
                  title="% of cohort with 20+ hard points in this skill (same threshold pd2.tools/builds uses)."
                >
                  Hard %
                </span>
              </th>
              <th className="font-normal text-right pb-1 w-14">
                <span
                  className="underline decoration-dotted underline-offset-2 cursor-help"
                  title="% of cohort with any base level in this skill (includes 1-pt prereqs)."
                >
                  Any %
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {display.map((sk) => {
              const isPrereqRow = sk.numAtTwenty === 0;
              const isSynergyRow =
                !isPrereqRow && roleOf(sk.name) === "synergy";
              const isTopBuild = topCoreNames.has(sk.name);
              return (
                <tr key={sk.name}>
                  <td
                    className={`py-1 ${
                      isPrereqRow
                        ? "text-muted-foreground italic"
                        : isSynergyRow
                          ? "text-muted-foreground"
                          : isTopBuild
                            ? "rarity-unique font-semibold"
                            : "text-foreground"
                    }`}
                  >
                    {sk.name}
                  </td>
                  <td className="py-1">
                    {isPrereqRow ? (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[#3d2817] text-muted-foreground">
                        Prereq
                      </span>
                    ) : isSynergyRow ? (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[#3d2817]/40 text-muted-foreground">
                        Synergy
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">
                    {sk.numAtTwenty.toLocaleString()}
                  </td>
                  <td
                    className={`py-1 text-right tabular-nums ${
                      isTopBuild ? "font-semibold" : "text-foreground"
                    }`}
                  >
                    {(sk.pctAtTwenty * 100).toFixed(1)}%
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">
                    {(sk.pctAny * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground/70 italic">
        Skill classification + prereq data scraped from{" "}
        <a
          href="https://wiki.projectdiablo2.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          wiki.projectdiablo2.com
        </a>{" "}
        (CC-BY-SA).
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Skill frequency — legacy variant (fallback when no className filter)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Level distribution — vertical bar chart (Tailwind, no chart library)
// ---------------------------------------------------------------------------

function LevelDistributionChart({
  buckets,
}: {
  buckets: BuildSheetData["levelDistribution"];
}) {
  const visible = buckets.filter((b) => b.count > 0);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground italic">— no data —</p>;
  }
  const maxCount = Math.max(...visible.map((b) => b.count));
  const BAR_AREA = 96;
  return (
    <div
      className="flex gap-1.5 items-end"
      style={{ height: BAR_AREA + 22 }}
    >
      {visible.map((b) => {
        const h = maxCount > 0 ? Math.max(3, (b.count / maxCount) * BAR_AREA) : 0;
        return (
          <div
            key={b.level}
            className="group relative flex flex-col items-center justify-end flex-1 min-w-2 cursor-default"
            style={{ height: "100%" }}
          >
            <span
              className="absolute left-1/2 -translate-x-1/2 px-1 rounded-sm border border-[#5e4a1f] bg-[#1a0f08] text-[10px] font-semibold tabular-nums text-[#ffd47a] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10"
              style={{ bottom: h + 18 }}
            >
              {b.count.toLocaleString()}
            </span>
            <div
              className="w-full max-w-7 rounded-sm bg-[#c9a04b] group-hover:bg-[#dfb55a] transition"
              style={{ height: h }}
            />
            <span className="text-[10px] text-muted-foreground tabular-nums leading-none mt-1">
              {b.level}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SkillFrequencyLegacy({
  rows,
}: {
  rows: BuildSheetData["skillFrequency"];
}) {
  return (
    <>
      <h3 className="d2-sublabel mb-2">Skill frequency</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">— no data —</p>
      ) : (
        <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
          <tbody>
            {rows.map((sk, i) => (
              <tr key={sk.name}>
                <td
                  className={`py-1 ${
                    i < 3 ? "rarity-unique font-semibold" : "text-foreground"
                  }`}
                >
                  {sk.name}
                </td>
                <td className="py-1 text-right tabular-nums text-muted-foreground pl-3">
                  {sk.numOccurrences.toLocaleString()}
                </td>
                <td className="py-1 text-right tabular-nums text-foreground w-14">
                  {sk.pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
