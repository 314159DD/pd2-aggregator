import type { ReactNode } from "react";
import { Card } from "@/components/lx/Card";

/** Finite number or 0, so no card can print NaN. */
export const fin = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function MetaCard({
  title,
  caption,
  action,
  className,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`flex flex-col gap-4 ${className ?? ""}`} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] leading-tight font-semibold text-ink">{title}</h2>
          {caption && <p className="text-xs text-muted-ink">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-ink-soft">{children}</p>;
}
