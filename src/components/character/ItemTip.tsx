import { formatHr } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { ItemPrice } from "@/lib/builds/types";

/** The parts of a raw character-API item the page reads. */
export type RawItem = {
  name: string;
  quality?: { name?: string };
  is_runeword?: boolean;
  is_ethereal?: boolean;
  corrupted?: boolean;
  graphic_id?: number | false;
  base?: { id?: string; name?: string; type?: string; type_code?: string; codes?: { normal?: string } };
  location?: { zone?: string; storage?: string; equipment?: string };
  properties?: string[];
};

export function itemType(item: RawItem): string {
  return item.is_runeword ? "Runeword" : (item.quality?.name ?? "");
}

/** Inventory art code, same rule as server/src/core/item-art.ts. */
export function itemInvCode(item: RawItem): string | null {
  const normal = item.base?.codes?.normal;
  if (normal) return normal;
  const id = item.base?.id;
  if (!id) return null;
  return id + (Number(item.graphic_id) >= 1 ? item.graphic_id : 1);
}

function priceLine(price: ItemPrice | null | undefined): string {
  if (!price) return "No price yet";
  return `${formatHr(price.medianHr)} HR (median of ${price.samples} ${price.source === "sold" ? "sold" : "asks"})`;
}

/** Chrome tooltip body for one item. The caller positions it. */
export function ItemTip({ item, price, id }: { item: RawItem; price?: ItemPrice | null; id?: string }) {
  const props = (item.properties ?? []).filter((p) => !(item.corrupted && p === "Corrupted"));
  const priced = ["Unique", "Set", "Runeword"].includes(itemType(item));
  return (
    <div
      id={id}
      role="tooltip"
      className="mat-chrome pointer-events-none z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl px-3.5 py-3 text-left text-xs leading-relaxed"
    >
      <p className={`text-sm font-semibold ${qualityClass(itemType(item))}`}>
        {item.name}
        {item.is_ethereal && <span className="font-normal opacity-70"> (Ethereal)</span>}
      </p>
      {item.base?.name && item.base.name !== item.name && <p className="opacity-60">{item.base.name}</p>}
      {props.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {props.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {item.corrupted && <p className="mt-1 font-medium text-danger">Corrupted</p>}
      {priced && <p className="mt-2 border-t border-white/10 pt-2 font-mono tabular-nums">{priceLine(price)}</p>}
    </div>
  );
}
