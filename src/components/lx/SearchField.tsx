import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Brown inset field. */
export function SearchField({
  className,
  type = "search",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn("feld h-10 w-full", className)} {...props} />;
}
