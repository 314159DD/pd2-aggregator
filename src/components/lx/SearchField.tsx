import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Well field, 44px, 12px radius. */
export function SearchField({
  className,
  type = "search",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn("feld h-11 w-full", className)} {...props} />;
}
