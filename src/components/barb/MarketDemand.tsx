"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/lx/Card";
import { getMarketDemand } from "@/lib/barb/api";
import { absorption, coveredDays, type MarketDemand as Demand } from "@/lib/barb/demand";
import type { GoldInputs, GoldResult } from "@/lib/barb/gold";
import { cn } from "@/lib/utils";

const MONO = "font-mono tabular-nums";
const nf = new Intl.NumberFormat("en-US");
const f1 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const hoursText = (h: number | null) => {
  if (h === null) return "n/a";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return h < 48 ? `${f1(h)} h` : `${f1(h / 24)} days`;
};
const ORBS = [
  { item: "Zakarum Orb", route: 0, stack: "zStack" },
  { item: "Horadrim Orb", route: 1, stack: "hStack" },
] as const;

type State = { status: "loading" } | { status: "error" } | { status: "ok"; data: Demand };

export function MarketDemand({ s, r }: { s: GoldInputs; r: GoldResult }) {
  const [st, setSt] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    getMarketDemand(ORBS.map((o) => o.item), 7, "softcore", ac.signal)
      .then((data) => setSt({ status: "ok", data }))
      .catch(() => {
        if (!ac.signal.aborted) setSt({ status: "error" });
      });
    return () => ac.abort();
  }, []);

  const now = new Date();
  const data = st.status === "ok" ? st.data : null;
  const covered = data ? coveredDays(data, now) : 0;
  const young = covered < 7;

  return (
    <Card as="section" aria-labelledby="h-demand" className="col-span-12">
      <h2 id="h-demand" className="text-xl font-semibold tracking-[-0.012em]">Market demand</h2>
      <p className="mt-1 mb-4 text-[13px] text-muted-ink">
        How many orbs the ladder softcore market took lately, measured from the trade site listings.
      </p>

      {st.status === "loading" && <p className="text-[13px] text-muted-ink">Loading market data.</p>}
      {st.status === "error" && <p className="text-[13px] text-muted-ink">Market data is unavailable right now. The calculator above still works.</p>}

      {data && (
        <>
          <p className="mb-4 text-[13px] text-ink-soft">
            {data.trackingSince
              ? `Tracking since ${new Date(data.trackingSince).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}, ${f1(covered)} ${covered === 1 ? "day" : "days"} of data.`
              : "No market data collected yet."}
          </p>
          {young && (
            <p className="mb-4 rounded-[14px] bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-warn">
              Less than 7 days of data. These numbers are not reliable yet and are scaled up to a full week, so one
              big sale can swing them a lot.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ORBS.map((o) => {
              const it = data.items.find((x) => x.name === o.item);
              if (!it) return null;
              const a = absorption(it, r.routes[o.route], s[o.stack], data, r, now);
              return (
                <div key={o.item} className="well rounded-[14px] px-4 py-4">
                  <h3 className="text-base font-semibold">{o.item}</h3>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
                    <dt className="text-muted-ink">Listed now</dt>
                    <dd className={cn("text-right", MONO)}>{nf.format(it.openListings)} listings, {nf.format(it.openQty)} orbs</dd>
                    <dt className="text-muted-ink">Left the market, last {data.days} days</dt>
                    <dd className={cn("text-right", MONO)}>
                      {nf.format(it.goneListings)} listings, {nf.format(it.goneQty + it.droppedQty)} orbs
                    </dd>
                    <dt className="text-muted-ink">Median time listed</dt>
                    <dd className={cn("text-right", MONO)}>{hoursText(it.medianHoursListed)}</dd>
                  </dl>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                    The market took about {f1(a.stacksPerWeek)} stacks per week
                    {a.farmHours !== null && <>, that is about {hoursText(a.farmHours)} of your farming</>}
                    {" "}({f1(a.wssPerWeek)} WSS).
                  </p>
                </div>
              );
            })}
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-[18px] text-xs leading-relaxed text-muted-ink">
            <li>A listing that disappears was not always sold, it can also be deleted or expired. Bulk sellers who sell through one listing show up as quantity drops, which are counted too.</li>
            <li>These numbers only cover the trade website. In-game trades are not visible, so treat the absorption figure as a broad lower bound, not an exact limit.</li>
          </ul>
        </>
      )}
    </Card>
  );
}
