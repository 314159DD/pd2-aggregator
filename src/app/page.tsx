"use client";
import { useEffect, useState } from "react";
import { FilterForm } from "@/components/FilterForm";
import { ItemFrequencyTable } from "@/components/ItemFrequencyTable";
import { AffixFrequencyTable } from "@/components/AffixFrequencyTable";
import { CharmPanel } from "@/components/CharmPanel";
import { BuildSheet } from "@/components/BuildSheet";
import { DataFreshness } from "@/components/DataFreshness";
import { DiffView } from "@/components/DiffView";
import { AvgStatsPanel } from "@/components/AvgStatsPanel";
import { TopAffixAveragesPanel } from "@/components/TopAffixAveragesPanel";
import { loadGuide, type LoadedGuide } from "@/lib/data-loader";
import {
  paramsToUiState,
  uiStateToParams,
  DEFAULT_UI_STATE,
  type UiState,
} from "@/lib/url-state";
import {
  diffCharacter,
  findCharacterInSample,
  pickCharacterFromAccountResponse,
  type CharacterDiff,
} from "@/lib/diff";
import { getCharactersByAccount } from "@/lib/api";

export default function Page() {
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const [guide, setGuide] = useState<LoadedGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Consulting the Horadric Cube…");
  const [diff, setDiff] = useState<CharacterDiff | null>(null);
  const [diffNotFound, setDiffNotFound] = useState(false);

  // Hydrate from URL on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUiState(paramsToUiState(new URLSearchParams(window.location.search)));
    setHydrated(true);
  }, []);

  async function run(s: UiState) {
    setUiState(s);
    setError(null);
    setDiff(null);
    setDiffNotFound(false);
    setLoadingMessage("Consulting the Horadric Cube…");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "?" + uiStateToParams(s).toString());
    }
    setLoading(true);
    try {
      const result = await loadGuide(
        { filter: s.filter, skills: s.skills },
        (msg) => setLoadingMessage(msg),
      );
      setGuide(result);

      if (s.mode === "diff" && s.diffName) {
        let found = null;

        // 1. Try the per-account API first.
        try {
          const accountResp = await getCharactersByAccount(s.diffName);
          if (accountResp) {
            found = pickCharacterFromAccountResponse(s.diffName, accountResp);
          }
        } catch {
          // fall through to local sample search
        }

        // 2. Fall back to searching the cached raw sample.
        if (!found) {
          found = findCharacterInSample(s.diffName, result.rawSample);
        }

        if (found) {
          setDiff(
            diffCharacter(found, {
              topItemsBySlot: result.topItemsBySlot,
              affixModsBySlot: result.clientAggregates.affixModsBySlot,
              poolMercType: result.buildSheet.mercenary.topType || null,
            }),
          );
        } else {
          setDiffNotFound(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="d2-title text-3xl sm:text-4xl">PD2 Build Aggregator</h1>
        <p className="text-sm text-muted-foreground mt-2 italic">Summoning…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3 border-b border-[#3d2817] pb-3">
        <h1 className="d2-title text-3xl sm:text-4xl">PD2 Build Aggregator</h1>
        <div className="flex flex-col items-end gap-1">
          <a
            href="https://www.buymeacoffee.com/SteenC"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Buy me a coffee"
            className="opacity-90 hover:opacity-100 transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.buymeacoffee.com/buttons/v2/arial-red.png"
              alt="Buy me a coffee"
              width={130}
              height={36}
              style={{ height: 36, width: "auto" }}
              loading="lazy"
            />
          </a>
          {guide && (
            <DataFreshness source={guide.source} fetchedAt={guide.fetchedAt} />
          )}
        </div>
      </header>

      <FilterForm initial={uiState} onSubmit={run} />

      {loading && (
        <div className="d2-panel rounded-sm p-4 text-sm text-muted-foreground italic">
          {loadingMessage}
        </div>
      )}

      {error && (
        <div className="d2-panel rounded-sm p-4 text-sm border-[#a52a2a]/60 text-[#ff6464]">
          Failed to load: {error}
        </div>
      )}

      {guide && !loading && <MatchBanner guide={guide} skillCount={uiState.skills.length} />}

      {uiState.mode === "diff" && diffNotFound && (
        <div className="d2-panel rounded-sm p-4 text-sm border-[#c9a04b]/40">
          Couldn&apos;t find a character or account named{" "}
          <strong className="rarity-unique">{uiState.diffName}</strong>. Push
          your character via{" "}
          <a
            className="rarity-runeword underline hover:opacity-80"
            href="https://github.com/coleestrin/pd2-character-downloader"
            target="_blank"
            rel="noreferrer"
          >
            pd2-character-downloader
          </a>{" "}
          so it appears here.
        </div>
      )}

      {uiState.mode === "diff" && diff && (
        <Section
          title="Diff vs pool"
          subtitle={`pool n=${guide?.clientAggregates.poolSize.toLocaleString() ?? "?"}`}
        >
          <DiffView data={diff} />
        </Section>
      )}

      {guide && (
        <>
          <Section
            title="Average build stats"
            subtitle={`n=${guide.clientAggregates.poolSize.toLocaleString()}`}
          >
            <div className="space-y-5">
              <AvgStatsPanel rows={guide.clientAggregates.coreStats} />
              <TopAffixAveragesPanel rows={guide.clientAggregates.avgStats} />
            </div>
          </Section>

          <Section
            title="Top equipped items by slot"
            subtitle={`n=${guide.itemUsageSampleSize.toLocaleString()}`}
          >
            <ItemFrequencyTable data={guide.topItemsBySlot} />
          </Section>

          <Section
            title="Most common affix mods"
            subtitle={`n=${guide.clientAggregates.poolSize.toLocaleString()} (sample of ${guide.rawSamplePoolSize.toLocaleString()})`}
          >
            <AffixFrequencyTable
              data={guide.clientAggregates.affixModsBySlot}
            />
          </Section>

          <Section
            title="Charm patterns"
            subtitle={`n=${guide.clientAggregates.poolSize.toLocaleString()}`}
          >
            <CharmPanel data={guide.clientAggregates.charms} />
          </Section>

          <Section
            title="Build sheet"
            subtitle={`n=${(
              guide.clientAggregates.skillUsage
                ? guide.clientAggregates.poolSize
                : guide.skillUsageSampleSize
            ).toLocaleString()}`}
          >
            <BuildSheet
              data={guide.buildSheet}
              skillUsage={guide.clientAggregates.skillUsage}
              className={guide.request.filter.className}
            />
          </Section>
        </>
      )}

      {!guide && !loading && !error && (
        <p className="text-sm text-muted-foreground italic">
          Pick filters and click{" "}
          <span className="rarity-unique font-semibold not-italic">Generate Guide</span>.
        </p>
      )}
    </main>
  );
}

function MatchBanner({
  guide,
  skillCount,
}: {
  guide: LoadedGuide;
  skillCount: number;
}) {
  const serverPool = guide.itemUsageSampleSize;
  const skillFiltered = guide.clientAggregates.poolSize;
  const rawPool = guide.rawSamplePoolSize;
  const className = guide.request.filter.className ?? "all classes";
  const minLevel = guide.request.filter.minLevel ?? 1;
  const gameMode = guide.request.filter.gameMode;

  return (
    <div className="d2-panel rounded-sm px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="d2-sublabel text-[10px] mb-1">Characters found</div>
          <div className="d2-title text-3xl rarity-unique tabular-nums">
            {(skillCount > 0 ? skillFiltered : serverPool).toLocaleString()}
            {skillCount > 0 && (
              <span className="text-base text-muted-foreground font-normal ml-2">
                of {rawPool.toLocaleString()}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {gameMode} {className} · level ≥ {minLevel}
            {skillCount > 0
              ? ` · ${skillCount} skill filter${skillCount === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
        {guide.truncated && (
          <div className="text-xs text-[#ff6464] text-right">
            (truncated to first {rawPool.toLocaleString()} of{" "}
            {guide.rawSampleTotalAvailable.toLocaleString()})
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="d2-panel rounded-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[#c9a04b]/5 ${
          open ? "border-b border-[#3d2817]" : ""
        }`}
      >
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          <h2 className="d2-title text-xl truncate">{title}</h2>
          {subtitle && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {subtitle}
            </span>
          )}
        </div>
        <span
          className="text-[#c9a04b] text-sm shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          ▶
        </span>
      </button>
      {open && <div className="p-5">{children}</div>}
    </section>
  );
}
