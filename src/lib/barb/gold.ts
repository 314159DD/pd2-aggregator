/** Gold find farm math for the /barb calculator. Pure, no I/O. */

export type Roll = "low" | "avg" | "high";

export interface GoldInputs {
  runSec: number;
  down: number;
  gMin: number;
  gMax: number;
  gf: number;
  gfBase: number;
  hours: number;
  hr: number;
  target: number;
  zCost: number;
  zStack: number;
  zWss: number;
  hCost: number;
  hStack: number;
  hWss: number;
  fGold: number;
  fWss: number;
  roll: Roll;
}

export const GOLD_DEFAULTS: GoldInputs = {
  runSec: 30, down: 10, gMin: 1_000_000, gMax: 2_000_000, gf: 3032, gfBase: 3032,
  hours: 2, hr: 100, target: 100,
  zCost: 179_712, zStack: 50, zWss: 15,
  hCost: 134_144, hStack: 50, hWss: 10,
  fGold: 5_000_000, fWss: 7,
  roll: "avg",
};

export interface Route {
  id: "z" | "h" | "f";
  name: string;
  note: string;
  stackGold: number;
  wss: number;
  /** Gold spent per WSS earned. */
  gpw: number;
}

export interface GoldResult {
  lo: number;
  avg: number;
  hi: number;
  gfMul: number;
  runs: number;
  gold: number;
  routes: Route[];
  best: Route;
  flat: Route;
  wss: number;
}

const fmt = new Intl.NumberFormat("en-US");

/** Gold drops scale with (100 + GF); gold per run is rescaled from the GF it was measured at. */
export function computeGold(s: GoldInputs): GoldResult {
  const gfMul = (100 + s.gf) / (100 + s.gfBase);
  const lo = s.gMin * gfMul;
  const hi = s.gMax * gfMul;
  const avg = (lo + hi) / 2;
  const per = { low: lo, avg, high: hi }[s.roll];
  const runs = (3600 / s.runSec) * (1 - s.down / 100);
  const gold = runs * per;
  const routes: Route[] = (
    [
      { id: "z", name: "Zakarum Orbs", note: `Stack of ${s.zStack} × ${fmt.format(s.zCost)} = ${fmt.format(s.zCost * s.zStack)} gold`, stackGold: s.zCost * s.zStack, wss: s.zWss },
      { id: "h", name: "Horadrim Orbs", note: `Stack of ${s.hStack} × ${fmt.format(s.hCost)} = ${fmt.format(s.hCost * s.hStack)} gold`, stackGold: s.hCost * s.hStack, wss: s.hWss },
      { id: "f", name: "Flat gold", note: `Lot of ${fmt.format(s.fGold)} gold`, stackGold: s.fGold, wss: s.fWss },
    ] as const
  ).map((r) => ({ ...r, gpw: r.stackGold / r.wss }));
  const best = routes.reduce((a, b) => (a.gpw <= b.gpw ? a : b));
  const flat = routes[2];
  return { lo, avg, hi, gfMul, runs, gold, routes, best, flat, wss: gold / best.gpw };
}

export function shortNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return n.toFixed(0);
}
