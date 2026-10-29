"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { Chip } from "@/components/lx/Chip";
import { Segment } from "@/components/lx/Segment";
import { MarketDemand } from "@/components/barb/MarketDemand";
import { GOLD_DEFAULTS, computeGold, shortNum, type GoldInputs, type Roll } from "@/lib/barb/gold";
import { cn } from "@/lib/utils";

const KEY = "pd2meta-barb-gold-v2";
const nf = new Intl.NumberFormat("en-US");
const fx = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a";
const dur = (h: number) => {
  if (!Number.isFinite(h)) return "n/a";
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
/** Fields where 0 would divide by zero. */
const NON_ZERO = new Set<keyof GoldInputs>(["runSec", "zCost", "zStack", "zWss", "hCost", "hStack", "hWss", "fGold", "fWss", "hr"]);

const MONO = "font-mono tabular-nums";

function Field({ id, label, hint, value, step = 1, onChange }: {
  id: keyof GoldInputs; label: string; hint?: string; value: number; step?: number; onChange(id: keyof GoldInputs, v: number): void;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-medium">{label}</span>
      <input
        className={cn("feld h-11 w-full", MONO)}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v >= 0 && !(NON_ZERO.has(id) && v === 0)) onChange(id, v);
        }}
      />
      {hint && <span className="text-xs text-muted-ink">{hint}</span>}
    </label>
  );
}

/** Rendered client-only (see app/barb/page.tsx), so localStorage is safe here. */
function loadSaved(): GoldInputs {
  try {
    return { ...GOLD_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return GOLD_DEFAULTS;
  }
}

function Kpi({ k, v, r }: { k: string; v: string; r?: string }) {
  return (
    <div className="well rounded-[14px] px-4 py-3.5">
      <div className="text-xs font-medium text-muted-ink">{k}</div>
      <div className={cn("mt-1.5 text-2xl font-medium tracking-[-0.01em]", MONO)}>{v}</div>
      {r && <div className={cn("mt-0.5 text-xs text-muted-ink", MONO)}>{r}</div>}
    </div>
  );
}

export function GoldCalc() {
  const [s, setS] = useState<GoldInputs>(loadSaved);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage can be blocked; the values still apply for this visit
    }
  }, [s]);

  const set = (id: keyof GoldInputs, v: number) => setS((p) => ({ ...p, [id]: v }));
  const r = computeGold(s);
  const maxGpw = Math.max(...r.routes.map((x) => x.gpw));
  const tH = s.target / r.wss;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 px-1 pt-4">
        <div className="text-xs font-medium tracking-[0.08em] text-muted-ink uppercase">Gold Find Barbarian</div>
        <h1 className="mt-2 mb-1.5 text-[32px] leading-[1.15] font-semibold tracking-[-0.022em]">Gold to WSS calculator</h1>
        <p className="max-w-[680px] text-base leading-normal text-ink-soft">
          How much gold a gold find Barb makes per hour, and which route turns it into the most Worldstone Shards: buying
          Zakarum or Horadrim Orbs from the vendor and selling the stacks, or selling the raw gold.
        </p>
      </header>

      <div className="kaskade-karten grid grid-cols-12 gap-5">
        <Card as="section" aria-labelledby="h-farm" className="col-span-12 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 id="h-farm" className="text-xl font-semibold tracking-[-0.012em]">Your farm</h2>
            <Button variant="ghost" size="sm" onClick={() => setS(GOLD_DEFAULTS)}>Reset</Button>
          </div>
          <p className="mt-1 mb-5 text-[13px] text-muted-ink">Saved in your browser. Defaults are a 3,032% GF Barb.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field id="runSec" label="Seconds per run" value={s.runSec} onChange={set} />
            <Field id="down" label="Downtime %" hint="Town, buying, trading" value={s.down} onChange={set} />
            <Field id="gMin" label="Gold per run, low" value={s.gMin} step={50000} onChange={set} />
            <Field id="gMax" label="Gold per run, high" value={s.gMax} step={50000} onChange={set} />
            <div className="col-span-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="gf" className="text-[13px] font-medium">Gold find</label>
                <span className={MONO}>{nf.format(s.gf)}%</span>
              </div>
              <input
                id="gf"
                type="range"
                min={0}
                max={5000}
                step={1}
                value={s.gf}
                onChange={(e) => set("gf", Number(e.target.value))}
                className="lx-range"
                style={{ "--fill": `${(s.gf / 5000) * 100}%` } as React.CSSProperties}
              />
              <span className="text-xs text-muted-ink">
                {s.gf === s.gfBase
                  ? `Gold per run measured at ${nf.format(s.gfBase)}% GF`
                  : `×${r.gfMul.toFixed(3)} gold vs ${nf.format(s.gfBase)}% GF, now ${shortNum(r.lo)} to ${shortNum(r.hi)} per run`}
              </span>
            </div>
            <Field id="gfBase" label="GF you measured at" value={s.gfBase} onChange={set} />
            <Field id="hours" label="Session hours" value={s.hours} step={0.5} onChange={set} />
            <Field id="hr" label="WSS per 1 HR" hint="Market price of one HR" value={s.hr} onChange={set} />
            <Field id="target" label="Goal in WSS" value={s.target} onChange={set} />
          </div>
        </Card>

        <Card as="section" aria-labelledby="h-res" className="col-span-12 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-res" className="text-xl font-semibold tracking-[-0.012em]">Per hour</h2>
            <Segment
              ariaLabel="Roll"
              value={s.roll}
              onChange={(v) => setS((p) => ({ ...p, roll: v as Roll }))}
              items={[
                { value: "low", label: "Low RNG" },
                { value: "avg", label: "Average" },
                { value: "high", label: "High RNG" },
              ]}
            />
          </div>
          <p className="mt-1 mb-4 text-[13px] text-muted-ink">
            Best route: {r.best.name}. {nf.format(r.best.stackGold)} gold buys {r.best.wss} WSS, that is{" "}
            {nf.format(Math.round(r.best.gpw))} gold per WSS.
          </p>
          <div className="mb-5 flex flex-wrap items-baseline gap-3.5">
            <span className={cn("text-5xl leading-none font-medium tracking-[-0.03em]", MONO)}>{fx(r.wss, 1)}</span>
            <span className="text-[15px] text-ink-soft">WSS per hour</span>
            <Chip className={MONO}>
              {fx(r.wss / s.hr, 2)} HR / h
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi k="Runs per hour" v={fx(r.runs, 0)} r={`${s.down}% downtime`} />
            <Kpi k="Gold per hour" v={shortNum(r.gold)} r={nf.format(Math.round(r.gold))} />
            <Kpi k="Session WSS" v={fx(r.wss * s.hours, 1)} r={`${s.hours} h · ${fx((r.wss * s.hours) / s.hr, 2)} HR`} />
            <Kpi k="Time to goal" v={dur(tH)} r={`${nf.format(s.target)} WSS · ${nf.format(Math.ceil(tH * r.runs))} runs`} />
          </div>
          <h3 className="mt-7 text-base font-semibold">RNG range, best route</h3>
          <p className="mt-1 mb-3 text-[13px] text-muted-ink">WSS per hour at low, average and high gold per run.</p>
          <div className="grid grid-cols-3 gap-3">
            {([["Low", r.lo], ["Average", r.avg], ["High", r.hi]] as const).map(([k, g]) => (
              <Kpi key={k} k={k} v={fx((r.runs * g) / r.best.gpw, 1)} r={`${shortNum(g)} / run`} />
            ))}
          </div>
        </Card>

        <section aria-labelledby="h-cmp" className="mat-thick col-span-12 rounded-[var(--radius-panel)] p-6 lg:col-span-7">
          <h2 id="h-cmp" className="text-xl font-semibold tracking-[-0.012em]">Conversion routes</h2>
          <p className="mt-1 mb-4 text-[13px] text-muted-ink">Orbs sell only as full stacks, so leftover gold waits for the next stack.</p>
          <div className="overflow-x-auto">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Route</th>
                  <th className="text-right!">Gold per WSS</th>
                  <th className="text-right!">WSS / h</th>
                  <th className="text-right!">Stacks / h</th>
                  <th className="text-right!">vs flat gold</th>
                </tr>
              </thead>
              <tbody>
                {r.routes.map((x) => {
                  const vs = (r.flat.gpw / x.gpw - 1) * 100;
                  const isBest = x === r.best;
                  return (
                    <tr key={x.id} className={cn(isBest && "bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]")}>
                      <td>
                        <div className="flex items-center gap-2 font-medium whitespace-nowrap">
                          {x.name}
                          {isBest && <Chip className="h-6 bg-none bg-ok-bg text-ok">Best</Chip>}
                        </div>
                        <div className="text-xs text-muted-ink">{x.note} → {x.wss} WSS</div>
                      </td>
                      <td className={cn("text-right", MONO)}>{nf.format(Math.round(x.gpw))}</td>
                      <td className={cn("text-right", MONO)}>{fx(r.gold / x.gpw, 1)}</td>
                      <td className={cn("text-right", MONO)}>{fx(r.gold / x.stackGold, 1)}</td>
                      <td className="text-right">
                        {x.id === "f" ? (
                          <Chip className="h-6">Base</Chip>
                        ) : (
                          <span className={cn(MONO, vs >= 0 ? "text-ok" : "text-warn")}>
                            {vs >= 0 ? "+" : ""}{fx(vs, 1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Card as="section" aria-labelledby="h-eff" className="col-span-12 lg:col-span-5">
          <h2 id="h-eff" className="text-xl font-semibold tracking-[-0.012em]">Gold needed per WSS</h2>
          <p className="mt-1 mb-4 text-[13px] text-muted-ink">Shorter is better.</p>
          <div className="flex flex-col gap-3.5">
            {r.routes.map((x) => (
              <div key={x.id} className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-[13px]">
                <span>{x.name}</span>
                <div className="well h-2.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-(--dauer-feder) ease-(--feder-glatt)", x === r.best ? "bg-glow" : "bg-ink-soft")}
                    style={{ width: `${((x.gpw / maxGpw) * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className={cn("text-right text-ink-soft", MONO)}>{shortNum(x.gpw)}</span>
              </div>
            ))}
          </div>
        </Card>

        <MarketDemand s={s} r={r} />

        <Card as="section" aria-labelledby="h-mkt" className="col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-mkt" className="text-xl font-semibold tracking-[-0.012em]">Market prices</h2>
            <span className="text-xs text-muted-ink">Update when the market moves</span>
          </div>
          <p className="mt-1 mb-5 text-[13px] text-muted-ink">Vendor gold cost per orb, stack size, and what a full stack sells for.</p>
          <div className="divide-y divide-line">
            {([
              ["Zakarum Orb", "Mapping material", [["zCost", "Gold per orb"], ["zStack", "Stack size"], ["zWss", "WSS per stack"]]],
              ["Horadrim Orb", "Mapping material", [["hCost", "Gold per orb"], ["hStack", "Stack size"], ["hWss", "WSS per stack"]]],
              ["Flat gold", "Sold to players", [["fGold", "Gold per lot"], ["fWss", "WSS per lot"]]],
            ] as const).map(([title, sub, fields]) => (
              <div key={title} className="grid grid-cols-1 items-end gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
                <div className="self-center text-sm font-medium">
                  {title}
                  <span className="block text-xs font-normal text-muted-ink">{sub}</span>
                </div>
                {fields.map(([id, label]) => (
                  <Field key={id} id={id} label={label} value={s[id]} step={id === "fGold" ? 100000 : 1} onChange={set} />
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card as="section" aria-labelledby="h-how" className="col-span-12">
          <h2 id="h-how" className="text-xl font-semibold tracking-[-0.012em]">How the math works</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-[18px] text-[13px] leading-relaxed text-ink-soft">
            <li>Runs per hour = 3600 / seconds per run, minus downtime. Gold per hour = runs × gold per run.</li>
            <li>Gold find scales gold drops linearly: dropped gold = base × (100 + GF) / 100. Moving the slider rescales gold per run from the GF it was measured at.</li>
            <li>Gold per WSS = (orb cost × stack size) / WSS per stack. Default prices: Zakarum 8,985,600 for 15 WSS, Horadrim 6,707,200 for 10 WSS, flat 5,000,000 for 7 WSS.</li>
            <li>Market check, ladder softcore, late October 2026: orbs list in stacks of 50 at 10 to 15 WSS (Zakarum) and 9 to 10 WSS (Horadrim), raw gold at about 600k to 1M per WSS, and 100 WSS = 1 HR. Listed prices are asking prices, not sales.</li>
            <li>Stacks per hour shows how often you hit the vendor. If that is high, raise downtime to cover buying and trading.</li>
            <li>HR values use your WSS per HR price. Prices are entered by hand, not read from the market.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
