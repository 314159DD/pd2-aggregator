"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Segment } from "@/components/lx/Segment";
import { itemArtUrl } from "@/lib/builds/item-art";
import type { ItemPrice } from "@/lib/builds/types";
import { cn } from "@/lib/utils";
import { ItemTip, itemInvCode, itemType, type RawItem } from "./ItemTip";

const RIM: Record<string, string> = {
  Unique: "var(--rarity-unique)",
  Set: "var(--rarity-set)",
  Runeword: "var(--rarity-rare)",
  Rare: "var(--rarity-rare)",
  Magic: "var(--rarity-magic)",
  Crafted: "var(--rarity-crafted)",
};

// Paper doll: [slot, column, row] on a 3 x 4 grid.
const SLOTS: Array<[string, number, number]> = [
  ["Helm", 2, 1],
  ["Amulet", 3, 1],
  ["Right Hand", 1, 2],
  ["Armor", 2, 2],
  ["Left Hand", 3, 2],
  ["Right Ring", 1, 3],
  ["Belt", 2, 3],
  ["Left Ring", 3, 3],
  ["Gloves", 1, 4],
  ["Boots", 3, 4],
];

function Art({ item }: { item: RawItem }) {
  const url = itemArtUrl({ name: item.name, invCode: itemInvCode(item), baseType: item.base?.type });
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span aria-hidden className="font-mono text-sm text-ink-soft">
        {item.name.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={item.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("max-h-full max-w-full object-contain", item.is_ethereal && "opacity-45")}
    />
  );
}

/** Focusable item well; the tooltip opens on hover, keyboard focus and tap. */
function ItemCell({
  item,
  price,
  label,
  align = "center",
  className,
  style,
}: {
  item: RawItem;
  price: ItemPrice | null | undefined;
  label?: string;
  align?: "left" | "center" | "right";
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<string | null>(null);

  // Tap or click outside closes.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const rim = RIM[itemType(item)] ?? "var(--line-strong)";
  return (
    <div
      ref={root}
      className={cn("relative", className)}
      style={style}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={label ? `${label}: ${item.name}` : item.name}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onFocus={() => pointer.current === null && setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          // A mouse click keeps the tooltip the hover opened; a tap or key press toggles it.
          setOpen((o) => pointer.current === "mouse" || !o);
          pointer.current = null;
        }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="well flex size-full items-center justify-center rounded-[14px] p-1.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        style={{ boxShadow: `var(--shadow-well), inset 0 0 0 1px color-mix(in oklab, ${rim} 45%, transparent)` }}
      >
        <Art item={item} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-2",
            align === "left" && "left-0",
            align === "right" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
          )}
        >
          <ItemTip id={id} item={item} price={price} />
        </div>
      )}
    </div>
  );
}

const MERC_HIDDEN = new Set(["Amulet", "Right Ring", "Left Ring"]);

const equipped = (items: RawItem[], slot: string) =>
  items.find((i) => i.location?.zone === "Equipped" && i.location.equipment === slot);

const RANK: Record<string, number> = { Unique: 0, Set: 1 };

export function EquipmentGrid({
  items,
  mercItems,
  prices,
}: {
  items: RawItem[];
  mercItems: RawItem[];
  prices: Record<string, ItemPrice | null>;
}) {
  const [who, setWho] = useState<"player" | "merc">("player");
  const list = who === "player" ? items : mercItems;
  const switchItems =
    who === "player" ? items.filter((i) => i.location?.zone === "Equipped" && /Switch$/.test(i.location.equipment ?? "")) : [];
  const charms =
    who === "player"
      ? items
          .filter((i) => i.base?.type_code?.includes("cha") && i.location?.storage === "Inventory")
          .sort((a, b) => (RANK[itemType(a)] ?? 2) - (RANK[itemType(b)] ?? 2))
      : [];

  return (
    <div className="flex flex-col gap-4">
      <Segment
        ariaLabel="Equipment owner"
        value={who}
        onChange={(v) => setWho(v as "player" | "merc")}
        items={[
          { value: "player", label: "Player" },
          { value: "merc", label: "Merc" },
        ]}
      />
      <div className="mx-auto grid w-full max-w-[26rem] grid-cols-3 gap-2.5" style={{ gridAutoRows: "5.25rem" }}>
        {SLOTS.filter(([slot]) => who === "player" || !MERC_HIDDEN.has(slot)).map(([slot, col, row]) => {
          const item = equipped(list, slot);
          const pos = { gridColumn: col, gridRow: row };
          const align = col === 1 ? "left" : col === 3 ? "right" : "center";
          return item ? (
            <ItemCell key={`${who}:${slot}`} item={item} price={prices[item.name]} label={slot} align={align} style={pos} />
          ) : (
            <div key={`${who}:${slot}`} style={pos} className="well flex items-end rounded-[14px] p-2 opacity-60">
              <span className="text-[11px] text-muted-ink">{slot}</span>
            </div>
          );
        })}
      </div>
      {switchItems.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Weapon switch</h3>
          <div className="flex flex-wrap gap-2.5">
            {switchItems.map((it, i) => (
              <ItemCell key={i} item={it} price={prices[it.name]} label={it.location?.equipment} className="size-16" />
            ))}
          </div>
        </section>
      )}
      {charms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Charms</h3>
          <div className="flex flex-wrap gap-2">
            {charms.map((it, i) => (
              <ItemCell key={i} item={it} price={prices[it.name]} className="size-11" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
