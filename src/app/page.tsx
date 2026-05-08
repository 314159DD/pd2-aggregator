"use client";
import { useEffect, useState } from "react";
import { FilterForm } from "@/components/FilterForm";
import { ItemFrequencyTable } from "@/components/ItemFrequencyTable";
import { BuildSheet } from "@/components/BuildSheet";
import { DataFreshness } from "@/components/DataFreshness";
import { loadGuide, type LoadedGuide } from "@/lib/data-loader";
import { paramsToUiState, uiStateToParams, DEFAULT_UI_STATE, type UiState } from "@/lib/url-state";

export default function Page() {
  const [uiState, setUiState] = useState<UiState>(DEFAULT_UI_STATE);
  const [guide, setGuide] = useState<LoadedGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from URL on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = paramsToUiState(new URLSearchParams(window.location.search));
    setUiState(fromUrl);
    setHydrated(true);
  }, []);

  async function run(s: UiState) {
    setUiState(s);
    setError(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "?" + uiStateToParams(s).toString());
    }
    if (s.mode !== "guide") return; // Phase 2 — diff mode not implemented yet.
    setLoading(true);
    try {
      const result = await loadGuide(s.filter);
      setGuide(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">PD2 Build Affix Aggregator</h1>
        <p className="text-sm text-muted-foreground mt-2">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">PD2 Build Affix Aggregator</h1>
        {guide && <DataFreshness source={guide.source} fetchedAt={guide.fetchedAt} />}
      </header>

      <FilterForm initial={uiState} onSubmit={run} />

      {loading && (
        <div className="rounded border p-4 text-sm text-muted-foreground">Loading guide…</div>
      )}

      {error && (
        <div className="rounded border border-rose-500 p-4 text-sm text-rose-700">
          Failed to load: {error}
        </div>
      )}

      {uiState.mode === "diff" && (
        <div className="rounded border border-amber-500 p-4 text-sm">
          Diff mode is Phase 2 — not yet implemented.
        </div>
      )}

      {guide && uiState.mode === "guide" && (
        <>
          <Section title="Top equipped items by slot" subtitle={`n=${guide.itemUsageSampleSize.toLocaleString()}`}>
            <ItemFrequencyTable data={guide.topItemsBySlot} />
          </Section>
          <Section title="Build sheet" subtitle={`n=${guide.skillUsageSampleSize.toLocaleString()}`}>
            <BuildSheet data={guide.buildSheet} />
          </Section>
          <p className="text-xs text-muted-foreground">
            Affix mods + charm patterns are Phase 2.
          </p>
        </>
      )}

      {!guide && !loading && !error && uiState.mode === "guide" && (
        <p className="text-sm text-muted-foreground">
          Pick filters and click <span className="font-semibold">Generate Guide</span>.
        </p>
      )}
    </main>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}
