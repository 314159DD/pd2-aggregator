import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Capsule chip, 26px; with `onRemove` it shows a remove button. */
export function Chip({
  children,
  onRemove,
  removeLabel,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full bg-well px-[11px] text-xs font-medium text-ink-soft",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel ?? "Remove"}
          onClick={onRemove}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-ink outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </span>
  );
}
