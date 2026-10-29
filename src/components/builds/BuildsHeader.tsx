import { formatCount } from "@/lib/builds/format";

export function BuildsHeader({
  seasonName,
  seasonNumber,
  gameMode,
  seasonTotal,
}: {
  seasonName: string | null;
  seasonNumber: number | null;
  gameMode: "softcore" | "hardcore";
  seasonTotal: number | null;
}) {
  const season = seasonNumber === null ? null : seasonName ? `${seasonName} (S${seasonNumber})` : `Season ${seasonNumber}`;
  return (
    <header className="px-1">
      <p className="font-mono text-xs tracking-[0.14em] text-accent-text">BUILDS</p>
      <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink">Builds</h1>
      <p className="mt-3 text-sm text-ink-soft">
        {season && <>{season} · </>}
        {gameMode === "hardcore" ? "Hardcore" : "Softcore"} ·{" "}
        <span className="font-mono tabular-nums">{seasonTotal === null ? "-" : formatCount(seasonTotal)}</span> characters
      </p>
      <p className="mt-2 max-w-2xl text-sm text-muted-ink">
        What every level 80+ ladder character is wearing right now: class shares, the skills they max, the gear and mercs they run,
        and what it costs at current market prices. Click anything to narrow it down.
      </p>
    </header>
  );
}
