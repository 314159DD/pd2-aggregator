/** Turns market demand data into "how much of your farming does the market absorb". Pure, no I/O. */
import type { GoldResult, Route } from "./gold";

export interface DemandItem {
  name: string;
  openListings: number;
  openQty: number;
  goneListings: number;
  goneQty: number;
  droppedQty: number;
  medianHoursListed: number | null;
}

export interface MarketDemand {
  trackingSince: string | null;
  days: number;
  items: DemandItem[];
}

export interface Absorption {
  /** Days the numbers really cover: the window, or less when tracking is younger. */
  coveredDays: number;
  /** Fewer than 7 days of data: do not trust the weekly figures yet. */
  reliable: boolean;
  orbsPerWeek: number;
  stacksPerWeek: number;
  /** Hours of your own farming it takes to buy that many stacks. Null when your stack rate is 0. */
  farmHours: number | null;
  /** WSS the market pays for those stacks at your price. */
  wssPerWeek: number;
}

const DAY_MS = 86_400_000;
export const MIN_COVERED_DAYS = 1 / 24;

export function coveredDays(d: MarketDemand, now: Date): number {
  const win = d.days;
  if (!d.trackingSince) return MIN_COVERED_DAYS;
  const since = (now.getTime() - new Date(d.trackingSince).getTime()) / DAY_MS;
  return Math.max(MIN_COVERED_DAYS, Math.min(win, since));
}

/** One orb route: leaving orbs = gone listings plus quantity drops, scaled to a week. */
export function absorption(
  item: DemandItem,
  route: Pick<Route, "stackGold" | "wss">,
  stackSize: number,
  d: MarketDemand,
  calc: Pick<GoldResult, "gold">,
  now: Date = new Date(),
): Absorption {
  const covered = coveredDays(d, now);
  const orbsPerWeek = ((item.goneQty + item.droppedQty) * 7) / covered;
  const stacksPerWeek = stackSize > 0 ? orbsPerWeek / stackSize : 0;
  const stacksPerHour = route.stackGold > 0 ? calc.gold / route.stackGold : 0;
  return {
    coveredDays: covered,
    reliable: covered >= 7,
    orbsPerWeek,
    stacksPerWeek,
    farmHours: stacksPerHour > 0 ? stacksPerWeek / stacksPerHour : null,
    wssPerWeek: stacksPerWeek * route.wss,
  };
}
