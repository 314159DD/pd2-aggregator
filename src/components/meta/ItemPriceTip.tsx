"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatHr } from "@/lib/builds/format";
import { qualityClass } from "@/lib/builds/quality";
import type { ItemData } from "@/lib/meta/items-data";
import type { TopItem } from "@/lib/meta/types";

function attributes(d: ItemData | undefined): string[] {
  const raw = d?.afterAttributes ?? d?.beforeAttributes ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function priceLine(item: TopItem): string {
  const p = item.price;
  if (!p) return "No price yet";
  return p.source === "sold" ? `${p.samples} sold in the last 7 days` : `${p.samples} open asks in the last 7 days`;
}

/** Hover and focus tooltip for one top item: attributes from items.json, own price, rune cost. No network. */
export function ItemPriceTip({
  item,
  gameMode,
  itemsData,
  children,
}: {
  item: TopItem;
  gameMode: "softcore" | "hardcore";
  itemsData: Map<string, ItemData>;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = 256;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    // Below the trigger; flip above when the lower part of the viewport is too short.
    const below = window.innerHeight - r.bottom > 280 || r.top < 280;
    setPos({ left, top: below ? r.bottom + 8 : Math.max(8, r.top - 8 - 260) });
    setOpen(true);
  }, []);
  const hide = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", show, true);
    window.addEventListener("resize", show);
    return () => {
      window.removeEventListener("scroll", show, true);
      window.removeEventListener("resize", show);
    };
  }, [open, show]);
  const attrs = attributes(itemsData.get(item.itemName));
  const est = item.runeCostEstimated ? "~" : "";
  const content = (
    <div className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2 text-left leading-relaxed whitespace-normal">
      <p className={`text-sm font-semibold ${qualityClass(item.itemType)}`}>{item.itemName}</p>
      {attrs.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {attrs.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-0.5 border-t border-[var(--line-strong)] pt-2">
        {item.price && <p className="font-mono tabular-nums">{`Median ${formatHr(item.price.medianHr)} HR`}</p>}
        <p className="text-ink-soft">{priceLine(item)}</p>
        <p className="text-muted-ink capitalize">{gameMode} ladder</p>
      </div>
      {item.itemType === "Runeword" && item.runes && item.runes.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-[var(--line-strong)] pt-2">
          <p>{item.runes.map((r) => r.rune).join(" + ")}</p>
          {item.runes.map((r, i) => (
            <p key={`${r.rune}-${i}`} className="flex justify-between gap-3 font-mono tabular-nums">
              <span>{r.rune}</span>
              <span>{r.medianHr === null ? "n/a, counted as 0.01" : `${formatHr(r.medianHr)} HR`}</span>
            </p>
          ))}
          {item.runeCostHr != null && <p className="font-mono tabular-nums">{`Total ${est}${formatHr(item.runeCostHr)} HR`}</p>}
        </div>
      )}
    </div>
  );
  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="min-w-0 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="lx mat-chrome pointer-events-none z-50 rounded-2xl px-3.5 py-3 text-xs"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
