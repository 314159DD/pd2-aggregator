const LINK =
  "underline-offset-2 outline-none hover:text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

/** Credits and licences band under every page. */
export function SiteFooter() {
  return (
    <div className="lx lx-stage px-3 pb-6 pt-4 sm:px-5">
      <footer className="mat-thin mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-panel)] px-4 py-3 text-[12px] text-ink-soft">
        <span>Character and market data from the official Project Diablo 2 API.</span>
        <span>
          Parts of the code from{" "}
          <a className={LINK} href="https://github.com/coleestrin/pd2-tools" target="_blank" rel="noreferrer">
            pd2.tools by Cole Estrin
          </a>{" "}
          (MIT).
        </span>
        <span>
          Item and skill data from the{" "}
          <a className={LINK} href="https://wiki.projectdiablo2.com" target="_blank" rel="noreferrer">
            PD2 wiki
          </a>{" "}
          (CC BY-SA 4.0).
        </span>
        <span>Build tiers from the Dark Humility tier list via pd2.madebykontra.com.</span>
        <span>Not affiliated with Project Diablo 2.</span>
        <span>Feedback: @tekk0n on Discord</span>
        <a className={`${LINK} ml-auto`} href="https://www.buymeacoffee.com/SteenC" target="_blank" rel="noreferrer">
          Buy me a beer
        </a>
      </footer>
    </div>
  );
}
