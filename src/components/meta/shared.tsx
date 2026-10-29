/** Finite number or 0, so no card can print NaN. */
export const fin = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
