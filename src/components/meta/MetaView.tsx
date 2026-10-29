"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { getSeasons } from "@/lib/builds/api";
import type { SeasonsResponse } from "@/lib/builds/types";
import { getMeta, getMetaDiff } from "@/lib/meta/api";
import { metaApiParams, parseMetaState, serializeMetaState, type MetaUpdate } from "@/lib/meta/state";
import type { CharacterDiff, MetaCohort } from "@/lib/meta/types";
import { CohortLine } from "./CohortLine";
import { MetaFilters } from "./MetaFilters";
import { MetaHeader } from "./MetaHeader";

export function MetaSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy="true">
      <div className="skelett h-36 rounded-[var(--radius-panel)]" />
      <div className="skelett h-64 rounded-[var(--radius-panel)]" />
      <div className="skelett h-10 rounded-full" />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="skelett h-72 rounded-[var(--radius-panel)] lg:col-span-6" />
        <div className="skelett h-72 rounded-[var(--radius-panel)] lg:col-span-6" />
      </div>
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy={loading}>
      <div className="kaskade-karten flex flex-col gap-5">
        <MetaHeader seasonLabel={seasonLabel} className={state.className} minLevel={state.minLevel} gameMode={state.gameMode} />

        <MetaFilters state={state} onChange={update} />

        {failed && (
          <div role="alert" className="flex items-center gap-3 self-start rounded-full bg-[var(--danger-bg)] py-1.5 pr-1.5 pl-4 text-sm text-danger">
            <span>Could not load the meta.</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setResult(null);
                setRetry((n) => n + 1);
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!meta ? (
          !failed && <div className="skelett h-56 rounded-[var(--radius-panel)]" />
        ) : (
          <>
            {!failed && <CohortLine meta={meta} state={state} />}
            {diff && (diff.failed || diff.diff === null) && (
              <Card className="p-5 text-sm text-ink-soft" role="status">
                {diff.failed ? "Could not load the comparison." : `No character or account named ${state.char} found.`}
              </Card>
            )}
            <div data-testid="meta-grid" className="grid gap-5 lg:grid-cols-12" />
          </>
        )}
      </div>
    </div>
  );
}
