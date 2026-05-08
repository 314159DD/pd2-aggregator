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
      <div className="d2-panel rounded-sm p-3 text-sm">
        <span className="text-muted-foreground uppercase text-xs tracking-widest">
          Diffing
        </span>{" "}
        <span className="rarity-unique font-semibold">{data.characterName}</span>{" "}
        <span className="text-muted-foreground">({data.accountName})</span> —{" "}
        <span className="rarity-unique">L{data.characterLevel}</span>{" "}
        <span>{data.className}</span>
      </div>

      <div className="d2-panel rounded-sm p-3 text-sm">
        <span className="text-muted-foreground uppercase text-xs tracking-widest">
          Mercenary
        </span>{" "}
        {data.mercTypeMatchesPool === null ? (
          <span className="text-muted-foreground italic">— No merc data —</span>
        ) : data.mercTypeMatchesPool ? (
          <span className="rarity-set">
            ✓ {data.userMercType}{" "}
            <span className="text-xs text-muted-foreground">
              (matches pool top: {data.poolMercType})
            </span>
          </span>
        ) : (
          <span className="text-[#ff6464]">
            ✗ {data.userMercType ?? "(none)"}{" "}
            <span className="text-xs text-muted-foreground">
              — pool top: {data.poolMercType}
            </span>
          </span>
        )}
      </div>

      <div className="space-y-3">
        {SLOT_ORDER.map((slot) => {
          const d = data.slots[slot];
          if (!d) return null;
          return (
            <div key={slot} className="d2-panel rounded-sm p-3 text-sm">
              <h4 className="d2-title text-sm mb-2">{slot}</h4>

              <div className="grid grid-cols-2 gap-x-4 mb-1">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    Pool top
                  </span>
                  <div className="rarity-unique font-medium">
                    {d.poolTopItemName ?? (
                      <span className="text-muted-foreground italic font-normal">
                        —
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    You wear
                  </span>
                  <div>
                    {d.userItemName ? (
                      <span
                        className={
                          d.userMatchesPoolTop
                            ? "rarity-set font-medium"
                            : "text-foreground"
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
                      <span className="text-muted-foreground italic">
                        (empty)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {d.poolTopAffixMods.length > 0 && (
                <div className="mt-3 border-t border-[#3d2817]/60 pt-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">
                    Top {d.poolTopAffixMods.length} affix mods in pool
                  </div>
                  <ul className="space-y-0.5">
                    {d.poolTopAffixMods.map((m) => (
                      <li
                        key={m.modName}
                        className={
                          m.userHas ? "rarity-set" : "text-[#ff6464]"
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
