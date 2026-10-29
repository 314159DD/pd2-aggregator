import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Stone-bevel panel, small radius, 24px padding. */
export function Card({
  as,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  const Tag = as ?? "div";
  return <Tag className={cn("karte p-6", className)} {...props} />;
}
