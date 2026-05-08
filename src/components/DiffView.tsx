import type { CharacterDiff } from "@/lib/diff";
import type { Slot } from "@/lib/types";

const SLOT_ORDER: Slot[] = [
  "weapon",
  "offhand",
  "helm",
  "armor",
  "gloves",
  "belt",
  "boots",
  "amulet",
  "ring",
];

export function DiffView({ data }: { data: CharacterDiff }) {
  return (
    <div className="space-y-4">
      {/* Character header */}
      <div className="rounded border p-3 text-sm bg-muted/40">
        Diffing{" "}
        <span className="font-semibold">{data.characterName}</span>{" "}
        <span className="text-muted-foreground">({data.accountName})</span> —
        L{data.characterLevel} {data.className}
      </div>

      {/* Mercenary */}
      <div className="rounded border p-3 text-sm">
        <span className="font-medium">Mercenary: </span>
        {data.mercTypeMatchesPool === null ? (
          <span className="text-muted-foreground">No merc data</span>
        ) : data.mercTypeMatchesPool ? (
          <span className="text-emerald-700">
            ✓ {data.userMercType}{" "}
            <span className="text-xs text-muted-foreground">
              (matches pool top: {data.poolMercType})
            </span>
          </span>
        ) : (
          <span className="text-rose-700">
            ✗ {data.userMercType ?? "(none)"}{" "}
            <span className="text-xs text-muted-foreground">
              — pool top: {data.poolMercType}
            </span>
          </span>
        )}
      </div>

      {/* Per-slot breakdown */}
      <div className="space-y-3">
        {SLOT_ORDER.map((slot) => {
          const d = data.slots[slot];
          if (!d) return null;
          return (
            <div key={slot} className="rounded border p-3 text-sm">
              <h4 className="font-semibold capitalize mb-2">{slot}</h4>

              <div className="grid grid-cols-2 gap-x-4 text-sm mb-1">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Pool top
                  </span>
                  <div className="font-medium">
                    {d.poolTopItemName ?? (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    You wear
                  </span>
                  <div>
                    {d.userItemName ? (
                      <span
                        className={
                          d.userMatchesPoolTop ? "font-medium text-emerald-700" : ""
                        }
                      >
                        {d.userItemName}
                        {d.userItemQuality && !d.userMatchesPoolTop && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({d.userItemQuality})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">(empty)</span>
                    )}
                  </div>
                </div>
              </div>

              {d.poolTopAffixMods.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    Top {d.poolTopAffixMods.length} affix mods in pool:
                  </div>
                  <ul className="space-y-0.5">
                    {d.poolTopAffixMods.map((m) => (
                      <li
                        key={m.modName}
                        className={
                          m.userHas ? "text-emerald-700" : "text-rose-700"
                        }
                      >
                        {m.userHas ? "✓" : "✗"} {m.displayLabel}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({(m.pct * 100).toFixed(0)}% of pool)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
