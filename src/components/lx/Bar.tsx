import { cn } from "@/lib/utils";

/** Horizontal share bar; `pct` is 0-100 and is clamped. */
export function Bar({ pct, className }: { pct: number; className?: string }) {
  const w = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-well", className)} aria-hidden>
      <div
        className="h-full rounded-sm"
        style={{ width: `${w}%`, background: "color-mix(in oklab, var(--glow) 55%, transparent)" }}
      />
    </div>
  );
}
