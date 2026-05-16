export function parsePriceHr(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.startsWith(".") ? "0" + raw : raw;
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function formatPrice(hr: number): string {
  if (hr < 1) return `~${hr.toFixed(1)} HR`;
  if (Number.isInteger(hr)) return `${hr} HR`;
  return `${hr.toFixed(1)} HR`;
}
