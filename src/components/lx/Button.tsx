import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANT = {
  primary: "d2-btn-gold",
  secondary: "d2-btn",
  ghost: "text-ink-soft hover:bg-[rgba(201,160,75,0.08)] hover:text-accent-hi rounded-[var(--radius)]",
} as const;

const SIZE = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-[18px] text-sm" } as const;

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:pointer-events-none disabled:opacity-50";

/** Stone button classes, for links that look like buttons. */
export function buttonClass(variant: keyof typeof VARIANT = "secondary", size: keyof typeof SIZE = "md", className?: string): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

/** Stone button: 40px, small 32px. Primary is the gold gradient. */
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
