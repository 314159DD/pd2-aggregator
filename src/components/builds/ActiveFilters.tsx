import Link from "next/link";
import { Button, buttonClass } from "@/components/lx/Button";
import { Chip } from "@/components/lx/Chip";
import {
  clearFilters,
  metaHref,
  setBudget,
  toggleClass,
  toggleItem,
  toggleMercItem,
  toggleMercType,
  toggleSkill,
  type BuildsState,
} from "@/lib/builds/url-state";
import { budgetLabel } from "./GearBudget";

/** One removable chip per active filter, Clear filters, and the hand-off to the Meta page. */
export function ActiveFilters({
  state,
  onChange,
}: {
  state: BuildsState;
  onChange: (next: BuildsState) => void;
}) {
  const chips: Array<{ key: string; label: string; next: BuildsState }> = [
    ...state.classes.map((c) => ({
      key: `c:${c}`,
      label: c,
      next: toggleClass(state, c),
    })),
    ...state.skills.map((k) => ({
      key: `s:${k.name}`,
      label: `${k.name} ${k.minLevel}+`,
      next: toggleSkill(state, k.name),
    })),
    ...state.items.map((i) => ({
      key: `i:${i}`,
      label: `Item: ${i}`,
      next: toggleItem(state, i),
    })),
    ...state.mercTypes.map((m) => ({
      key: `m:${m}`,
      label: `Merc: ${m}`,
      next: toggleMercType(state, m),
    })),
    ...state.mercItems.map((m) => ({
      key: `mi:${m}`,
      label: `Merc item: ${m}`,
      next: toggleMercItem(state, m),
    })),
    ...(state.maxGearHr !== null
      ? [
          {
            key: "b",
            label: `Budget ${budgetLabel(state.maxGearHr)}`,
            next: setBudget(state, null),
          },
        ]
      : []),
  ];

  return (
    <div className="contents">
      {chips.length > 0 && (
        <div className="order-3 flex basis-full flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Chip
              key={c.key}
              removeLabel={`Remove ${c.label}`}
              onRemove={() => onChange(c.next)}
            >
              {c.label}
            </Chip>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(clearFilters(state))}
          >
            Clear filters
          </Button>
        </div>
      )}
      <Link
        href={metaHref(state)}
        className={buttonClass("secondary", "sm", "order-2 ml-auto")}
      >
        Open in Meta
      </Link>
    </div>
  );
}
