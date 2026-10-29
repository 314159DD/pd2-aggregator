import { acrossSlots } from "@/lib/meta/across-slots";
import { META_SLOTS, type AffixMod, type AffixSlot, type MetaSlot } from "@/lib/meta/types";
import { formatCount } from "@/lib/builds/format";
import { fin } from "./shared";

// Meta flags appear as modifiers but are not rollable mods.
const META_FLAG_LABELS = new Set(["corrupted", "desecrated", "mirrored"]);
const isMetaFlag = (label: string) => META_FLAG_LABELS.has(label.toLowerCase().trim());

export function AffixFrequencyTable({ data }: { data: Record<MetaSlot, AffixSlot> }) {
  const summary = acrossSlots(data ?? ({} as Record<MetaSlot, AffixSlot>));
  return (
    <div className="space-y-5">
      {summary.mods.length > 0 && (
        <div className="d2-slot-block" style={{ borderLeftColor: "#c9a04b" }}>
          <h3 className="d2-sublabel mb-2">All slots combined</h3>
          <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-ink/70">
                <th className="font-normal text-left pb-1">Mod</th>
                <th className="font-normal text-right pb-1 w-14">%</th>
                <th className="font-normal text-right pb-1 w-14">Count</th>
              </tr>
            </thead>
            <tbody>
              {summary.mods.slice(0, 15).map((m, i) => (
                <tr key={m.modName}>
                  <td className={`py-1 ${i < 5 ? "rarity-unique font-semibold" : "text-ink"}`}>{m.displayLabel}</td>
                  <td className="py-1 text-right tabular-nums text-ink">{(fin(m.pct) * 100).toFixed(0)}%</td>
                  <td className="py-1 text-right tabular-nums text-muted-ink">{formatCount(fin(m.count))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <hr className="d2-rule" />
      <div className="d2-sublabel text-muted-ink/70">By slot</div>

      <div className="space-y-5">
        {META_SLOTS.map((slot, idx) => {
          const mods = (data?.[slot]?.mods ?? []).filter((m) => !isMetaFlag(m.displayLabel));
          return (
            <div key={slot}>
              {idx > 0 && <hr className="d2-rule mb-5" />}
              <div className="d2-slot-block" role="group" aria-label={slot}>
                <h3 className="d2-sublabel mb-2">{slot}</h3>
                {mods.length === 0 ? <p className="text-sm text-muted-ink italic">— no rare/magic/crafted items —</p> : <SlotTable mods={mods} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotTable({ mods }: { mods: AffixMod[] }) {
  return (
    <table className="block overflow-x-auto sm:table sm:overflow-visible w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-muted-ink/70">
          <th className="font-normal text-left pb-1">Mod</th>
          <th className="font-normal text-right pb-1 w-14">%</th>
          <th className="font-normal text-right pb-1 w-14">Med</th>
          <th className="font-normal text-right pb-1 w-14">P75</th>
        </tr>
      </thead>
      <tbody>
        {mods.slice(0, 12).map((m, i) => (
          <tr key={m.modName}>
            <td className={`py-1 ${i < 3 ? "rarity-unique font-semibold" : "text-ink"}`}>{m.displayLabel}</td>
            <td className="py-1 text-right tabular-nums text-ink">{(fin(m.pct) * 100).toFixed(0)}%</td>
            <td className="py-1 text-right tabular-nums text-muted-ink">{m.medianValue ? fin(m.medianValue).toFixed(0) : "—"}</td>
            <td className="py-1 text-right tabular-nums text-muted-ink">{m.p75Value ? fin(m.p75Value).toFixed(0) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
