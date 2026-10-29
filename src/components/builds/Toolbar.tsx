import { Segment } from "@/components/lx/Segment";
import { LEVEL_PRESETS, type BuildsState } from "@/lib/builds/url-state";

const ITEMS = LEVEL_PRESETS.map((l) => ({ value: String(l), label: l === 99 ? "99" : `${l}+` }));

/** Level presets. Season and mode live in the header ScopeSwitch on Builds routes. */
export function Toolbar({ minLevel, onLevel }: { minLevel: BuildsState["minLevel"]; onLevel: (l: BuildsState["minLevel"]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-muted-ink">Level</span>
      <Segment
        ariaLabel="Minimum level"
        value={String(minLevel)}
        onChange={(v) => onLevel(Number(v) as BuildsState["minLevel"])}
        items={ITEMS}
      />
    </div>
  );
}
