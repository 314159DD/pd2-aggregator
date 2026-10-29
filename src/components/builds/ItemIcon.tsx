"use client";

import { useState } from "react";
import { itemArtUrl, skillIconUrl } from "@/lib/builds/item-art";

const RIM: Record<string, string> = {
  Unique: "var(--rarity-unique)",
  Set: "var(--rarity-set)",
  Runeword: "var(--rarity-rare)",
  Rare: "var(--rarity-rare)",
  Magic: "var(--rarity-magic)",
  Crafted: "var(--rarity-crafted)",
};

type Props = {
  item: { name: string; itemType: string; invCode: string | null; baseType?: string | null };
  size?: 28 | 36;
};

/** Skill icon with the same first-letter fallback as ItemIcon. */
export function SkillIcon({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="well inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg">
      {failed ? (
        <span aria-hidden className="font-mono text-xs text-ink-soft">
          {name.charAt(0)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={skillIconUrl(name)} alt="" loading="lazy" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
      )}
    </span>
  );
}

/** Item art in a well with a quality-coloured 1px inner ring; first letter when there is no art. */
export function ItemIcon({ item, size = 28 }: Props) {
  const url = itemArtUrl(item);
  const [failed, setFailed] = useState(false);
  const rim = RIM[item.itemType] ?? "var(--line-strong)";
  return (
    <span
      className="well inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{
        width: size,
        height: size,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${rim} 45%, transparent)`,
      }}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span aria-hidden className="font-mono text-xs text-ink-soft">
          {item.name.charAt(0)}
        </span>
      )}
    </span>
  );
}
