import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Stone tooltip shown on hover and keyboard focus of its wrapper. */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group relative inline-flex", className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="mat-chrome pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 rounded-sm px-3 py-2 text-xs whitespace-nowrap opacity-0 transition-opacity duration-(--dauer-kurz) ease-arrive group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
