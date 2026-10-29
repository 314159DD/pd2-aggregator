import { buttonClass } from "@/components/lx/Button";
import { formatAgo, formatCount } from "@/lib/builds/format";
import { buildsHrefFromMeta } from "@/lib/builds/url-state";
import type { MetaState } from "@/lib/meta/state";
import type { MetaCohort } from "@/lib/meta/types";

const plural = (c: string) => (c.endsWith("s") ? `${c}es` : `${c}s`);

export function CohortLine({ meta, state }: { meta: MetaCohort; state: MetaState }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-live="polite">
      <p className="text-sm text-ink-soft" data-testid="cohort-count">
        <span className="font-mono text-base font-medium text-ink tabular-nums">{formatCount(meta.poolSize)}</span>{" "}
        {meta.poolSize === 1 ? "character matches" : "characters match"}
        {state.skills.length > 0 && (
          <span className="text-muted-ink">
            {" "}
            of <span className="font-mono tabular-nums">{formatCount(meta.basePoolSize)}</span> {plural(state.className)}
          </span>
        )}
      </p>
      {meta.poolSize === 0 && <p className="text-sm text-muted-ink">Try fewer skills or a lower level.</p>}
      <a href={buildsHrefFromMeta(state)} className={buttonClass("secondary", "sm")}>
        See characters ›
      </a>
      {meta.pricesComputedAt && <span className="text-xs text-muted-ink">Prices updated {formatAgo(meta.pricesComputedAt)}</span>}
    </div>
  );
}
