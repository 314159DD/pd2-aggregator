"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { getBuildCharacters, getHistory, getSeasons, getUsage } from "@/lib/builds/api";
import type { BuildShareHistory, BuildsCharactersPage, BuildsUsage, SeasonsResponse } from "@/lib/builds/types";
import {
  parseBuildsState,
  serializeBuildsState,
  setBudget,
  setLevel,
  toApiParams,
  toggleClass,
  toggleItem,
  toggleMercItem,
  toggleMercType,
  toggleSkill,
  type BuildsState,
} from "@/lib/builds/url-state";
import { isArchiveSeason } from "@/lib/builds/scope";
import { AddAccount } from "./AddAccount";
import { ActiveFilters } from "./ActiveFilters";
import { BuildsHeader } from "./BuildsHeader";
import { CharacterTable } from "./CharacterTable";
import { ClassShare } from "./ClassShare";
import { GearBudget } from "./GearBudget";
import { ItemIcon, SkillIcon } from "./ItemIcon";
import { ShoppingList } from "./ShoppingList";
import { Toolbar } from "./Toolbar";
import { UsageCard } from "./UsageCard";

type Data = { usage: BuildsUsage; characters: BuildsCharactersPage };

export function BuildsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy="true">
      <div className="skelett h-36 rounded-[var(--radius-panel)]" />
      <div className="skelett h-24 rounded-[var(--radius-panel)]" />
      <div className="skelett h-56 rounded-[var(--radius-panel)]" />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="skelett h-48 rounded-[var(--radius-panel)] lg:col-span-4" />
        <div className="skelett h-96 rounded-[var(--radius-panel)] lg:col-span-8" />
      </div>
    </div>
  );
}

export function BuildsView() {
  const router = useRouter();
  const key = useSearchParams()?.toString() ?? "";
  const state = useMemo(() => parseBuildsState(new URLSearchParams(key)), [key]);

  // `key` says which request produced the result; a mismatch with the current request means loading.
  const [result, setResult] = useState<{ key: string; data: Data | null; failed: boolean } | null>(null);
  const [lastData, setLastData] = useState<Data | null>(null);
  const [retry, setRetry] = useState(0);
  const [history, setHistory] = useState<BuildShareHistory | null>(null);

  const update = useCallback(
    (next: BuildsState) => router.replace(`/builds?${serializeBuildsState(next).toString()}`, { scroll: false }),
    [router],
  );

  const [seasons, setSeasons] = useState<SeasonsResponse | null>(null);
  const archive = isArchiveSeason(state.season, seasons);

  // Usage and character page for the current filters; the last result stays on screen meanwhile.
  // Archive seasons have no prices, so the budget is not sent.
  const apiState = useMemo(() => (archive ? { ...state, maxGearHr: null } : state), [archive, state]);
  const apiKey = toApiParams(apiState).toString();
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      Promise.all([getUsage(apiState, ac.signal), getBuildCharacters(apiState, ac.signal)])
        .then(([usage, characters]) => {
          setResult({ key: apiKey, data: { usage, characters }, failed: false });
          setLastData({ usage, characters });
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
          setResult({ key: apiKey, data: null, failed: true });
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // `state` is derived from apiKey's inputs; apiKey is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, retry]);

  const loading = result?.key !== apiKey;
  const failed = !loading && result?.failed === true;
  const data = lastData;

  const { season, gameMode } = state;
  useEffect(() => {
    const ac = new AbortController();
    getHistory({ season, gameMode }, ac.signal)
      .then(setHistory)
      .catch(() => setHistory(null));
    return () => ac.abort();
  }, [season, gameMode]);

  useEffect(() => {
    const ac = new AbortController();
    getSeasons(ac.signal)
      .then(setSeasons)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const seasonNumber = state.season ?? seasons?.current ?? null;
  const seasonName = seasons?.seasons.find((s) => s.season === seasonNumber)?.name ?? null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy={loading}>
      <div className="kaskade-karten flex flex-col gap-5">
        <BuildsHeader
          seasonName={seasonName}
          seasonNumber={seasonNumber}
          gameMode={state.gameMode}
          seasonTotal={data?.usage.seasonTotal ?? null}
        />

        <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
          <Toolbar minLevel={state.minLevel} onLevel={(l) => update(setLevel(state, l))} />
          <ActiveFilters state={state} onChange={update} archive={archive} />
        </Card>

        {failed && (
          <div role="alert" className="flex items-center gap-3 rounded-full bg-[var(--danger-bg)] py-1.5 pr-1.5 pl-4 text-sm text-danger">
            <span>Could not load builds.</span>
            <Button size="sm" variant="secondary" onClick={() => {
                setResult(null);
                setRetry((n) => n + 1);
              }}>
              Retry
            </Button>
          </div>
        )}

        {!data && !failed ? (
          <div className="skelett h-56 rounded-[var(--radius-panel)]" />
        ) : (
          data && (
            <>
              <ClassShare
                breakdown={data.usage.breakdown}
                selected={state.classes}
                history={history}
                onToggle={(c) => update(toggleClass(state, c))}
                onClear={() => update({ ...state, classes: [], page: 1 })}
              />

              <div className="grid gap-5 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
                  {!archive && <GearBudget value={state.maxGearHr} onChange={(v) => update(setBudget(state, v))} />}
                  <UsageCard
                    title="Skills"
                    entries={data.usage.skills}
                    selected={state.skills.map((k) => k.name)}
                    onToggle={(n) => update(toggleSkill(state, n))}
                    icon={(e) => <SkillIcon name={e.name} />}
                  />
                  <UsageCard
                    title="Items"
                    entries={data.usage.items}
                    selected={state.items}
                    onToggle={(n) => update(toggleItem(state, n))}
                    icon={(e) => <ItemIcon item={e} />}
                  />
                  <UsageCard
                    title="Mercenary"
                    entries={data.usage.mercTypes}
                    selected={state.mercTypes}
                    onToggle={(n) => update(toggleMercType(state, n))}
                  />
                  <UsageCard
                    title="Merc items"
                    entries={data.usage.mercItems}
                    selected={state.mercItems}
                    onToggle={(n) => update(toggleMercItem(state, n))}
                    icon={(e) => <ItemIcon item={e} />}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
                  <ShoppingList items={data.usage.items} archive={archive} />
                  <CharacterTable page={data.characters} state={state} onChange={update} archive={archive} />
                  <section className="mat-thick flex flex-col gap-3 rounded-[var(--radius-panel)] p-5" aria-label="Add account">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">Add account</h2>
                      <p className="mt-1 text-xs text-ink-soft">Not listed? Track an account and its characters show up here.</p>
                    </div>
                    <AddAccount />
                  </section>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
