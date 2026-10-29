"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buttonClass, Button } from "@/components/lx/Button";
import { Card } from "@/components/lx/Card";
import { getCharacter, getCharacterHistory, getSeasons } from "@/lib/builds/api";
import { readScope } from "@/lib/builds/scope";
import type { CharacterDetail, CharacterHistory } from "@/lib/builds/types";
import { CharacterHeader } from "./CharacterHeader";
import { EquipmentGrid } from "./EquipmentGrid";
import type { RawItem } from "./ItemTip";
import { LevelChart } from "./LevelChart";
import { SkillsPanel } from "./SkillsPanel";
import { StatsPanel } from "./StatsPanel";

type Raw = {
  accountName?: string | null;
  character?: { name: string; level: number; life: number | null; mana: number | null; class?: { name: string }; skills?: Array<{ name: string; level: number }> };
  items?: RawItem[];
  mercenary?: { items?: RawItem[] } | null;
  realSkills?: Array<{ skill: string; level: number; baseLevel?: number }>;
};

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "failed" }
  | { status: "ready"; detail: CharacterDetail; history: CharacterHistory["history"] };

export function CharacterSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5" aria-busy="true">
      <div className="skelett h-40 rounded-[var(--radius-panel)]" />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="skelett h-[40rem] rounded-[var(--radius-panel)] lg:col-span-7" />
        <div className="skelett h-[40rem] rounded-[var(--radius-panel)] lg:col-span-5" />
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-xs font-semibold tracking-wide text-ink-soft uppercase">{children}</h2>;
}

function NotFound({ failed, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <Card className="flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">{failed ? "Could not load this character." : "Character not found"}</h1>
        <div className="flex gap-2">
          {failed && onRetry && <Button onClick={onRetry}>Retry</Button>}
          <a href="/builds" className={buttonClass("secondary", "md")}>
            Back to Builds
          </a>
        </div>
      </Card>
    </div>
  );
}

export function CharacterView() {
  const params = useSearchParams();
  const key = params?.toString() ?? "";
  const [state, setState] = useState<{ key: string; value: State } | null>(null);
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const p = new URLSearchParams(key);
  const name = p.get("name") ?? "";
  const { season, gameMode } = readScope(p);

  useEffect(() => {
    if (!name) return;
    const ac = new AbortController();
    const scope = { season, gameMode };
    Promise.all([getCharacter(name, scope, ac.signal), getCharacterHistory(name, scope, ac.signal).catch(() => null)])
      .then(([detail, hist]) => {
        if (ac.signal.aborted) return;
        setState({
          key,
          value: detail ? { status: "ready", detail, history: hist?.history ?? [] } : { status: "missing" },
        });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ key, value: { status: "failed" } });
      });
    return () => ac.abort();
    // `key` is the identity of name, season and gameMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  const seasonNumber = state?.value.status === "ready" ? state.value.detail.season : null;
  useEffect(() => {
    if (seasonNumber === null) return;
    const ac = new AbortController();
    getSeasons(ac.signal)
      .then((s) => setSeasonName(s.seasons?.find((x) => x.season === seasonNumber)?.name ?? null))
      .catch(() => {});
    return () => ac.abort();
  }, [seasonNumber]);

  if (!name) return <NotFound />;
  const current = state?.key === key ? state.value : ({ status: "loading" } as State);
  if (current.status === "loading") return <CharacterSkeleton />;
  if (current.status === "missing") return <NotFound />;
  if (current.status === "failed")
    return (
      <NotFound
        failed
        onRetry={() => {
          setState(null);
          setRetry((n) => n + 1);
        }}
      />
    );

  const { detail, history } = current;
  const raw = detail as unknown as Raw;
  const ch = raw.character;
  const display = ch?.name ?? name;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="kaskade-karten flex flex-col gap-5">
        <CharacterHeader
          info={{
            name: display,
            className: ch?.class?.name ?? "",
            level: ch?.level ?? 0,
            mode: detail.mode,
            season: detail.season,
            seasonName,
            account: raw.accountName ?? null,
            lastIngestedAt: detail.lastIngestedAt,
            gearValueHr: detail.gear.valueHr,
            gearPartial: detail.gear.partial,
            mercValueHr: detail.gear.mercValueHr,
          }}
        />
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
            <Card>
              <Title>Equipment</Title>
              <EquipmentGrid items={raw.items ?? []} mercItems={raw.mercenary?.items ?? []} prices={detail.prices} />
            </Card>
            <Card>
              <Title>Stats</Title>
              <StatsPanel stats={detail.realStats} life={ch?.life ?? null} mana={ch?.mana ?? null} />
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
            <Card>
              <Title>Skills</Title>
              <SkillsPanel realSkills={raw.realSkills} skills={ch?.skills ?? []} />
            </Card>
            <Card>
              <Title>Level history</Title>
              <LevelChart history={history} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
