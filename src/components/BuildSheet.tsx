"use client";
import { useState } from "react";
import type { BuildSheet as BuildSheetData } from "@/lib/shape/buildSheet";
import type { SkillUsageEntry } from "@/lib/aggregate";

export function BuildSheet({
  data,
  skillUsage,
}: {
  data: BuildSheetData;
  /** Prereq-classified skill usage. When present, replaces the server-side
   *  `data.skillFrequency` table and unlocks the "Show prerequisites" toggle. */
  skillUsage?: SkillUsageEntry[] | null;
}) {
  return (
    <div className="space-y-5">
      {/* Skills */}
      <div className="d2-slot-block">
        {skillUsage && skillUsage.length > 0 ? (
          <SkillFrequencyClassified rows={skillUsage} />
        ) : (
          <SkillFrequencyLegacy rows={data.skillFrequency} />
        )}
      </div>

      <hr className="d2-rule" />

      {/* Level distribution */}
      <div className="d2-slot-block">
        <h3 className="d2-sublabel mb-2">Level distribution</h3>
        {data.levelDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">— no data —</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 text-sm">
            {data.levelDistribution.map((b) => (
              <span
                key={b.level}
                className="px-2 py-0.5 rounded-sm border border-[#3d2817] text-foreground"
              >
                <span className="text-muted-foreground">L</span>
                {b.level}
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold tabular-nums">
                  {b.count.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        )}
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
                        {it.itemName}{" "}
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

function SkillFrequencyClassified({ rows }: { rows: SkillUsageEntry[] }) {
  const [showPrereqs, setShowPrereqs] = useState(false);

  // Build view: skills classified as part of the build for any character.
  const buildRows = rows.filter((r) => r.numAsBuild > 0);
  // Prereq view: skills classified ONLY as prereqs (never as build for anyone).
  const prereqOnlyRows = rows.filter(
    (r) => r.numAsBuild === 0 && r.numAsPrereq > 0,
  );

  const display = showPrereqs ? [...buildRows, ...prereqOnlyRows] : buildRows;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <h3 className="d2-sublabel">Skill frequency</h3>
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

      {display.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">— no data —</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {display.map((sk, i) => {
              const isPrereqOnly = sk.numAsBuild === 0;
              // Highlight only top-3 build skills.
              const isTopBuild = !isPrereqOnly && i < 3;
              return (
                <tr key={sk.name}>
                  <td
                    className={`py-1 ${
                      isPrereqOnly
                        ? "text-muted-foreground italic"
                        : isTopBuild
                          ? "rarity-unique font-semibold"
                          : "text-foreground"
                    }`}
                  >
                    {sk.name}
                    {isPrereqOnly && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 not-italic">
                        prereq
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground pl-3">
                    {sk.numAsBuild.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums text-foreground w-14">
                    {(sk.pctBuild * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground/70 italic">
        Prereq detection uses skill-tree data from{" "}
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
        <table className="w-full text-sm">
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
