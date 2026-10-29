const W = 64;
const H = 20;
const PAD = 2;

/**
 * 64x20 polyline. `xs` (optional, same length as `values`) are x positions such as day numbers,
 * so gaps in the data stay gaps; without it points are evenly spaced.
 */
export function Sparkline({ values, xs, label }: { values: number[]; xs?: number[]; label: string }) {
  if (values.length < 2) return null;
  const px = xs && xs.length === values.length ? xs : values.map((_, i) => i);
  const x0 = px[0];
  const xSpan = px[px.length - 1] - x0 || 1;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ySpan = hi - lo;
  const points = values
    .map((v, i) => {
      const x = PAD + ((px[i] - x0) / xSpan) * (W - PAD * 2);
      const y = ySpan === 0 ? H / 2 : H - PAD - ((v - lo) / ySpan) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block shrink-0">
      <polyline points={points} fill="none" stroke="var(--accent-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
