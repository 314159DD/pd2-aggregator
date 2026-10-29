import { formatAgo, formatCount } from "@/lib/builds/format";
import { buildsHrefFromMeta } from "@/lib/builds/url-state";
import type { MetaState } from "@/lib/meta/state";
import type { MetaCohort } from "@/lib/meta/types";

const plural = (c: string) => (c.endsWith("s") ? `${c}es` : `${c}s`);

/** The old "Characters found" card, with season, archive note, prices age and the link into Builds. */
export function MatchBanner({
  meta,
  state,
  seasonLabel,
  archive = false,
  stale = false,
}: {
  meta: MetaCohort;
  state: MetaState;
  seasonLabel: string | null;
  archive?: boolean;
  stale?: boolean;
}) {
  const skillCount = state.skills.length;
  return (
    <div className="d2-panel rounded-sm px-5 py-4" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className={`transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
          <div className="d2-sublabel text-[10px] mb-1">Characters found</div>
          <div className="d2-title text-3xl rarity-unique tabular-nums" data-testid="cohort-count">
            {formatCount(meta.poolSize)}
            {skillCount > 0 && (
              <span className="text-base text-muted-ink font-normal ml-2" style={{ WebkitTextFillColor: "currentColor" }}>
                of {formatCount(meta.basePoolSize)} {plural(state.className)}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-ink mt-1">
            {seasonLabel ? `${seasonLabel} · ` : ""}
            {state.gameMode} {state.className} · level ≥ {state.minLevel}
            {skillCount > 0 ? ` · ${skillCount} skill filter${skillCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-ink">
          <a href={buildsHrefFromMeta(state)} className="uppercase tracking-wider underline underline-offset-2 hover:text-[#ffd47a] transition">
            See characters ›
          </a>
          {meta.pricesComputedAt && !archive && <span>Prices updated {formatAgo(meta.pricesComputedAt)}</span>}
        </div>
      </div>
      {archive && <p className="mt-2 text-xs text-muted-ink italic">Past season: item prices and rune costs are not available.</p>}
      {meta.poolSize === 0 && !stale && <p className="mt-2 text-xs text-[#ff6464]">No characters match. Try fewer skills or a lower level.</p>}
    </div>
  );
}
