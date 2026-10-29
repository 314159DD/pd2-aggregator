"use client";

import { usePathname } from "next/navigation";
import { shellWidth } from "./SiteHeader";

const LINK = "underline underline-offset-2 not-italic outline-none hover:text-[#ffd47a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

/** Credits and licences, centred italic small print like the old footer. */
export function SiteFooter() {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  return (
    <div className="lx px-4 pt-6 pb-8 sm:px-6">
      <footer className={`mx-auto flex w-full ${shellWidth(path)} flex-col items-center gap-1 border-t border-[#3d2817] pt-4 text-center text-xs text-muted-ink italic`}>
        <p>Character and market data from the official Project Diablo 2 API.</p>
        <p>
          Parts of the code from{" "}
          <a className={LINK} href="https://github.com/coleestrin/pd2-tools" target="_blank" rel="noreferrer">
            pd2.tools by Cole Estrin
          </a>{" "}
          (MIT).
        </p>
        <p>
          Item and skill data from the{" "}
          <a className={LINK} href="https://wiki.projectdiablo2.com" target="_blank" rel="noreferrer">
            PD2 wiki
          </a>{" "}
          (CC BY-SA 4.0).
        </p>
        <p>Build tiers from the Dark Humility tier list via pd2.madebykontra.com.</p>
        <p>Not affiliated with Project Diablo 2.</p>
        <p>
          Feedback: <span className="rarity-unique font-semibold not-italic">@tekk0n</span> on Discord
        </p>
      </footer>
    </div>
  );
}
