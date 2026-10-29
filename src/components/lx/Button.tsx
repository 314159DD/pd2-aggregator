import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANT = {
  primary: "sheen bg-ink text-paper hover:opacity-90 shadow-[var(--shadow-press)]",
  secondary:
    "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] text-ink shadow-[inset_0_1px_0_var(--edge),inset_0_0_0_1px_var(--line-strong)] hover:bg-surface",
  ghost: "text-ink-soft hover:bg-well hover:text-ink",
} as const;

const SIZE = { sm: "h-8 px-3.5 text-[13px]", md: "h-10 px-[18px] text-sm" } as const;

const BASE =
  "drueckbar inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:pointer-events-none disabled:opacity-50";

/** Capsule button classes, for links that look like buttons. */
export function buttonClass(variant: keyof typeof VARIANT = "secondary", size: keyof typeof SIZE = "md", className?: string): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

/** Capsule button: 40px, small 32px. */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...props}
    />
  );
}
