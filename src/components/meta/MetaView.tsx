"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSeasons } from "@/lib/builds/api";
import { isArchiveSeason } from "@/lib/builds/scope";
import type { SeasonsResponse } from "@/lib/builds/types";
import { getMeta, getMetaDiff } from "@/lib/meta/api";
import { metaApiParams, parseMetaState, serializeMetaState, type MetaUpdate } from "@/lib/meta/state";
import type { CharacterDiff, MetaCohort } from "@/lib/meta/types";
import { AffixFrequencyTable } from "./AffixFrequencyTable";
import { AvgStatsPanel } from "./AvgStatsPanel";
import { BuildSheet } from "./BuildSheet";
import { CharmPanel } from "./CharmPanel";
import { DiffView } from "./DiffView";
import { FilterForm } from "./FilterForm";
import { ItemFrequencyTable } from "./ItemFrequencyTable";
import { MatchBanner } from "./MatchBanner";
import { Section } from "./Section";
import { TopAffixAveragesPanel } from "./TopAffixAveragesPanel";

export function MetaSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[61rem] space-y-6" aria-busy="true">
      <div className="d2-panel rounded-sm p-4 text-sm text-muted-ink italic">Consulting the Horadric Cube…</div>
    </div>
  );
}

type Result = { key: string; meta: MetaCohort | null };
type DiffResult = { key: string; diff: CharacterDiff | null; failed: boolean };

export function MetaView() {
  const router = useRouter();
  const pathname = (usePathname() ?? "/").replace(/\/+$/, "") || "/";
  const paramKey = useSearchParams()?.toString() ?? "";
  const state = useMemo(() => parseMetaState(new URLSearchParams(paramKey)), [paramKey]);

  // Updaters run against the newest state, also when two clicks land before the URL has re-rendered.
  const newest = useRef(state);
  useEffect(() => {
    newest.current = state;
  });
  const update = useCallback<MetaUpdate>(
    (fn) => {
      const next = fn(newest.current);
      newest.current = next;
      router.replace(`${pathname === "/meta" ? "/meta" : "/"}?${serializeMetaState(next).toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  const [seasons, setSeasons] = useState<SeasonsResponse | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    getSeasons(ac.signal)
      .then(setSeasons)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // Cohort: debounced and abortable; only the latest request may write its result.
  const apiKey = metaApiParams(state).toString();
  const latest = useRef(0);
  const [result, setResult] = useState<Result | null>(null);
  const [last, setLast] = useState<MetaCohort | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const id = ++latest.current;
    const ac = new AbortController();
    const t = setTimeout(() => {
      getMeta(state, ac.signal)
        .then((meta) => {
          if (id !== latest.current) return;
          setResult({ key: apiKey, meta });
          setLast(meta);
        })
        .catch((e: unknown) => {
          if (id !== latest.current || ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
          setResult({ key: apiKey, meta: null });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // `state` is derived from apiKey's inputs; apiKey is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, retry]);

  const loading = result?.key !== apiKey;
  const failed = !loading && result?.meta === null;
  const meta = last;

  // Diff: after the cohort, same latest-wins rule.
  const cohortReady = !loading && !failed;
  const wantsDiff = state.mode === "diff" && state.char !== "";
  const diffKey = `${apiKey}|${state.char}`;
  const latestDiff = useRef(0);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  useEffect(() => {
    if (!wantsDiff || !cohortReady) return;
    const id = ++latestDiff.current;
    const ac = new AbortController();
    getMetaDiff(state, state.char, ac.signal)
      .then((diff) => id === latestDiff.current && setDiffResult({ key: diffKey, diff, failed: false }))
      .catch((e: unknown) => {
        if (id !== latestDiff.current || ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        setDiffResult({ key: diffKey, diff: null, failed: true });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffKey, wantsDiff, cohortReady]);
  const diff = wantsDiff && diffResult?.key === diffKey ? diffResult : null;

  const seasonNumber = state.season ?? seasons?.current ?? null;
  const seasonName = seasons?.seasons.find((s) => s.season === seasonNumber)?.name;
  const seasonLabel = seasonNumber === null || !seasonName ? null : `${seasonName} (S${seasonNumber})`;

  return (
    <div className="mx-auto w-full max-w-[61rem] space-y-6" aria-busy={loading}>
      <FilterForm state={state} onChange={update} />

      {failed && (
        <div role="alert" className="d2-panel rounded-sm p-4 text-sm border-[#a52a2a]/60 text-[#ff6464] flex flex-wrap items-center gap-3">
          <span>Could not load the meta.</span>
          <button
            type="button"
            className="d2-btn px-3 py-1 text-xs"
            onClick={() => {
              setResult(null);
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!meta
        ? !failed && <div className="d2-panel rounded-sm p-4 text-sm text-muted-ink italic">Consulting the Horadric Cube…</div>
        : !failed && (
            <>
              <MatchBanner
                meta={meta}
                state={state}
                seasonLabel={seasonLabel}
                archive={isArchiveSeason(seasonNumber, seasons)}
                stale={loading}
              />
              {diff && diff.failed && (
                <div className="d2-panel rounded-sm p-4 text-sm" role="status">
                  Could not load the comparison.
                </div>
              )}
              {diff && !diff.failed && (
                <Section title="Diff vs pool">
                  <DiffView diff={diff.diff} notFoundName={state.char} state={state} season={meta.season} pool={meta.topItemsBySlot} />
                </Section>
              )}
              <Section title="Average build stats">
                <div className="space-y-5">
                  <AvgStatsPanel rows={meta.coreStats} />
                  <TopAffixAveragesPanel rows={meta.avgStats} />
                </div>
              </Section>
              <Section title="Top equipped items by slot">
                <ItemFrequencyTable data={meta.topItemsBySlot} gameMode={state.gameMode} />
              </Section>
              <Section title="Most common affix mods">
                <AffixFrequencyTable data={meta.affixModsBySlot} />
              </Section>
              <Section title="Charm patterns">
                <CharmPanel data={meta.charms} />
              </Section>
              <Section title="Build sheet">
                <BuildSheet meta={meta} />
              </Section>
            </>
          )}
    </div>
  );
}
