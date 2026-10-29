const nf = new Intl.NumberFormat("en-US");

export function formatHr(v: number | null): string {
  if (v === null) return "n/a";
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return v.toFixed(0);
}

export function formatPct(p: number): string {
  return `${p > 0 && p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
}

export function formatCount(n: number): string {
  return nf.format(n);
}

export function formatAgo(iso: string, now: Date | number = Date.now()): string {
  const secs = Math.max(0, (new Date(now).getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
