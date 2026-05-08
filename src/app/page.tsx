"use client";
import { useEffect, useState } from "react";
import { FilterForm } from "@/components/FilterForm";
import { ItemFrequencyTable } from "@/components/ItemFrequencyTable";
import { AffixFrequencyTable } from "@/components/AffixFrequencyTable";
import { CharmPanel } from "@/components/CharmPanel";
import { BuildSheet } from "@/components/BuildSheet";
import { DataFreshness } from "@/components/DataFreshness";
import { DiffView } from "@/components/DiffView";
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
  const [diff, setDiff] = useState<CharacterDiff | null>(null);
  const [diffNotFound, setDiffNotFound] = useState(false);

  // Hydrate from URL on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUiState(paramsToUiState(new URLSearchParams(window.location.search)));
    setHydrated(true);
  }, []);

  async function run(s: UiState, samplePages: number) {
    setUiState(s);
    setError(null);
    setDiff(null);
    setDiffNotFound(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "?" + uiStateToParams(s).toString());
    }
    setLoading(true);
    try {
      const result = await loadGuide({ filter: s.filter, skills: s.skills, samplePages });
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
      <header className="flex items-baseline justify-between flex-wrap gap-2 border-b border-[#3d2817] pb-3">
        <h1 className="d2-title text-3xl sm:text-4xl">PD2 Build Aggregator</h1>
        {guide && (
          <DataFreshness source={guide.source} fetchedAt={guide.fetchedAt} />
        )}
      </header>

      <FilterForm initial={uiState} onSubmit={run} />

      {loading && (
        <div className="d2-panel rounded-sm p-4 text-sm text-muted-foreground italic">
          Consulting the Horadric Cube…
        </div>
      )}

      {error && (
        <div className="d2-panel rounded-sm p-4 text-sm border-[#a52a2a]/60 text-[#ff6464]">
          Failed to load: {error}
        </div>
      )}

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
            title="Top equipped items by slot"
            subtitle={`server pool n=${guide.itemUsageSampleSize.toLocaleString()}`}
          >
            <ItemFrequencyTable data={guide.topItemsBySlot} />
          </Section>

          <Section
            title="Most common affix mods"
            subtitle={`skill-filtered n=${guide.clientAggregates.poolSize.toLocaleString()} of ${guide.rawSamplePoolSize.toLocaleString()} sampled`}
          >
            <AffixFrequencyTable data={guide.clientAggregates.affixModsBySlot} />
          </Section>

          <Section
            title="Charm patterns"
            subtitle={`n=${guide.clientAggregates.poolSize.toLocaleString()}`}
          >
            <CharmPanel data={guide.clientAggregates.charms} />
          </Section>

          <Section
            title="Build sheet"
            subtitle={`server pool n=${guide.skillUsageSampleSize.toLocaleString()}`}
          >
            <BuildSheet data={guide.buildSheet} />
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

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="d2-panel rounded-sm p-5">
      <header className="flex items-baseline justify-between mb-4 flex-wrap gap-2 border-b border-[#3d2817] pb-2">
        <h2 className="d2-title text-xl">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
