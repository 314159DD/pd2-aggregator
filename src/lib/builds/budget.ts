/** Selectable gear budget stops in HR; `null` means Any and sits last. */
export const GEAR_BUDGET_STOPS: Array<number | null> = [0, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, null];

/** Index of the nearest stop at or above `v`; `null` and values above the last number map to Any. */
export function budgetIndex(v: number | null): number {
  const last = GEAR_BUDGET_STOPS.length - 1;
  if (v === null) return last;
  const i = GEAR_BUDGET_STOPS.findIndex((s) => s !== null && s >= v);
  return i === -1 ? last : i;
}
