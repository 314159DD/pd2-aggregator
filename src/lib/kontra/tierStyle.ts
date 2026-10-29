import type { Tier } from "./types";

/** Background + text colour classes for a tier square, keyed by tier band. */
export function tierSquareClass(tier: Tier): string {
  const band = tier[0];
  switch (band) {
    case "S":
      return "bg-gradient-to-b from-[#dfb55a] to-[#a07a30] text-[#0a0604]";
    case "A":
      return "bg-gradient-to-b from-[#3f8f4a] to-[#2a6332] text-[#eafce9]";
    case "B":
      return "bg-gradient-to-b from-[#3a6ea5] to-[#274d75] text-[#e9f1fc]";
    case "C":
      return "bg-gradient-to-b from-[#b5852f] to-[#856020] text-[#fdf3df]";
    case "D":
      return "bg-gradient-to-b from-[#9a6b2a] to-[#6e4c1d] text-[#fdf3df]";
    default: // F
      return "bg-gradient-to-b from-[#5a5a5a] to-[#3a3a3a] text-[#dddddd]";
  }
}
