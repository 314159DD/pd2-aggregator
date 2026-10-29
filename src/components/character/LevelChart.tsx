"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Row = { ts: string; level: number };

const H = 160;
const PAD = { l: 30, r: 12, t: 10, b: 26 };
const LO = 80;
const HI = 99;
const TICKS = [80, 85, 90, 95, 99];

const day = (ts: string) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function LevelChart({ history }: { history: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [history.length]);

  if (history.length < 2) return <p className="text-sm text-ink-soft">Not enough history yet.</p>;

  const first = history[0];
  const last = history[history.length - 1];
  const t0 = new Date(first.ts).getTime();
  const span = new Date(last.ts).getTime() - t0 || 1;
  const x = (ts: string) => PAD.l + ((new Date(ts).getTime() - t0) / span) * (w - PAD.l - PAD.r);
  const y = (lvl: number) => PAD.t + (1 - (Math.min(HI, Math.max(LO, lvl)) - LO) / (HI - LO)) * (H - PAD.t - PAD.b);
  const points = history.map((r) => `${x(r.ts).toFixed(1)},${y(r.level).toFixed(1)}`).join(" ");
  const label = `Level ${first.level} on ${day(first.ts)} to ${last.level} on ${day(last.ts)}`;

  return (
    <div ref={ref} className="w-full">
      <svg role="img" aria-label={label} width="100%" height={H} viewBox={`0 0 ${w} ${H}`} className="block">
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="font-mono" fill="var(--muted-ink)">
              {t}
            </text>
          </g>
        ))}
        <polyline points={points} fill="none" stroke="var(--accent-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {history.map((r, i) => (
          <circle key={i} cx={x(r.ts)} cy={y(r.level)} r="2.5" fill="var(--accent-text)" />
        ))}
        <text x={PAD.l} y={H - 6} fontSize="10" className="font-mono" fill="var(--muted-ink)">
          {day(first.ts)}
        </text>
        <text x={w - PAD.r} y={H - 6} textAnchor="end" fontSize="10" className="font-mono" fill="var(--muted-ink)">
          {day(last.ts)}
        </text>
      </svg>
    </div>
  );
}
