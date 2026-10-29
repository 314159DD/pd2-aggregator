export function MetaHeader({
  seasonLabel,
  className,
  minLevel,
  gameMode,
  archive = false,
}: {
  seasonLabel: string | null;
  className: string;
  minLevel: number;
  gameMode: "softcore" | "hardcore";
  archive?: boolean;
}) {
  return (
    <header className="px-1">
      <p className="font-mono text-xs tracking-[0.14em] text-accent-text">META</p>
      <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink">Meta</h1>
      <p className="mt-3 text-sm text-ink-soft">
        {seasonLabel ?? "-"} · {gameMode === "hardcore" ? "Hardcore" : "Softcore"} · {className} · level {minLevel}+
      </p>
      {archive && <p className="mt-2 text-sm text-ink-soft">Past season: item prices and rune costs are not available.</p>}
      <p className="mt-2 max-w-2xl text-sm text-muted-ink">
        What the characters of one build actually wear: the uniques per slot, the affixes on their rares, their charms, skills and mercs,
        across every matching level {minLevel}+ ladder character.
      </p>
    </header>
  );
}
