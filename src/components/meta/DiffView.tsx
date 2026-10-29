import { displayName } from "@/lib/builds/display-name";
import type { MetaState } from "@/lib/meta/state";
import { META_SLOTS, type CharacterDiff, type MetaSlot, type TopItem } from "@/lib/meta/types";
import { cap, fin } from "./shared";

const MODE_LABEL = { softcore: "Softcore", hardcore: "Hardcore" } as const;

function rarity(t: string | null | undefined): string {
  switch ((t ?? "").toLowerCase()) {
    case "unique":
      return "rarity-unique";
    case "set":
      return "rarity-set";
    case "runeword":
      return "rarity-runeword";
    case "rare":
      return "rarity-rare";
    case "magic":
      return "rarity-magic";
    case "crafted":
      return "rarity-crafted";
    default:
      return "text-ink";
  }
}

/** Quality colour of the cohort's top pick, looked up in the cohort when it is passed in. */
function poolQuality(pool: Record<MetaSlot, TopItem[]> | undefined, slot: MetaSlot, name: string): string {
  const hit = pool?.[slot]?.find((i) => i.itemName === name);
  return hit ? rarity(hit.itemType) : "rarity-unique";
}

/** The old "Diff vs pool" panels, fed by /meta/diff. */
export function DiffView({
  diff,
  notFoundName,
  state,
  season,
  pool,
}: {
  diff: CharacterDiff | null;
  notFoundName?: string;
  state: MetaState;
  season?: number | null;
  pool?: Record<MetaSlot, TopItem[]>;
}) {
  if (!diff) {
    const name = notFoundName ?? state.char;
    const s = state.season ?? season ?? null;
    const href = `/builds/account?name=${encodeURIComponent(name)}${s !== null ? `&season=${s}` : ""}`;
    return (
      <div className="d2-panel rounded-sm p-4 text-sm border-[#c9a04b]/40" role="status">
        <p>
          {`No character or account named "${displayName(name)}" this season.`}
        </p>
        <a href={href} className="rarity-runeword underline hover:opacity-80 mt-1 inline-block">
          Track this account
        </a>
      </div>
    );
  }

  const mode = diff.mode;
  const crossMode = mode !== state.gameMode && (mode === "softcore" || mode === "hardcore");
  return (
    <div className="space-y-4">
      <div className="d2-panel rounded-sm p-3 text-sm">
        <span className="text-muted-ink uppercase text-xs tracking-widest">Diffing</span>{" "}
        <span className="rarity-unique font-semibold">{displayName(diff.characterName)}</span>
        {diff.accountName && <span className="text-muted-ink"> ({diff.accountName})</span>} {"· "}
        <span className="rarity-unique">L{fin(diff.characterLevel)}</span> <span>{diff.className}</span>{" "}
        <span className="text-muted-ink">· {MODE_LABEL[mode] ?? cap(String(mode))}</span>
        {crossMode && (
          <p role="status" className="text-xs text-muted-ink mt-1">
            {`Found in ${MODE_LABEL[mode]}; compared against the ${MODE_LABEL[mode]} pool.`}
          </p>
        )}
      </div>

      <div className="d2-panel rounded-sm p-3 text-sm">
        <span className="text-muted-ink uppercase text-xs tracking-widest">Mercenary</span>{" "}
        {diff.mercTypeMatchesPool === null || diff.mercTypeMatchesPool === undefined ? (
          <span className="text-muted-ink italic">— No merc data —</span>
        ) : diff.mercTypeMatchesPool ? (
          <span className="rarity-set">
            ✓ {diff.userMercType} <span className="text-xs text-muted-ink">(matches pool top: {diff.poolMercType})</span>
          </span>
        ) : (
          <span className="text-[#ff6464]">
            ✗ {diff.userMercType ?? "(none)"} <span className="text-xs text-muted-ink">— pool top: {diff.poolMercType}</span>
          </span>
        )}
      </div>

      <div className="space-y-3">
        {META_SLOTS.map((slot) => {
          const d = diff.slots?.[slot];
          if (!d) return null;
          return (
            <div key={slot} className="d2-panel rounded-sm p-3 text-sm" role="group" aria-label={cap(slot)}>
              <h4 className="d2-title text-sm mb-2">{slot}</h4>

              <div className="grid grid-cols-2 gap-x-4 mb-1">
                <div>
                  <span className="text-xs text-muted-ink uppercase tracking-widest">Pool top</span>
                  <div className="font-medium">
                    {d.poolTopItemName ? (
                      <span className={poolQuality(crossMode ? undefined : pool, slot, d.poolTopItemName)}>{d.poolTopItemName}</span>
                    ) : (
                      <span className="text-muted-ink italic font-normal">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-ink uppercase tracking-widest">You wear</span>
                  <div>
                    {d.userItemName ? (
                      <span className={d.userMatchesPoolTop ? "rarity-set font-medium" : rarity(d.userItemQuality)}>
                        {d.userItemName}
                        {d.userItemQuality && !d.userMatchesPoolTop && <span className="text-xs text-muted-ink ml-2">({d.userItemQuality})</span>}
                      </span>
                    ) : (
                      <span className="text-muted-ink italic">(empty)</span>
                    )}
                  </div>
                </div>
              </div>

              {(d.poolTopAffixMods ?? []).length > 0 && (
                <div className="mt-3 border-t border-[#3d2817]/60 pt-2">
                  <div className="text-xs text-muted-ink uppercase tracking-widest mb-1.5">Top {d.poolTopAffixMods.length} affix mods in pool</div>
                  <ul className="space-y-0.5">
                    {d.poolTopAffixMods.map((m) => (
                      <li key={m.modName} className={m.userHas ? "rarity-set" : "text-[#ff6464]"}>
                        <span role="img" aria-label={m.userHas ? "You have it" : "You do not have it"}>
                          {m.userHas ? "✓" : "✗"}
                        </span>{" "}
                        {m.displayLabel} <span className="text-xs text-muted-ink">({(fin(m.pct) * 100).toFixed(0)}% of pool)</span>
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
