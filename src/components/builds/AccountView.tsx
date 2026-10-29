"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buttonClass, Button } from "@/components/lx/Button";
import { Chip } from "@/components/lx/Chip";
import { getAccount } from "@/lib/builds/api";
import { displayName } from "@/lib/builds/display-name";
import { formatAgo } from "@/lib/builds/format";
import { classIconUrl } from "@/lib/builds/item-art";
import { readScope } from "@/lib/builds/scope";
import { AddAccount } from "./AddAccount";

type Row = {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  lastUpdated: number | null;
};

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; rows: Row[] };

function toRow(raw: Record<string, unknown>): Row | null {
  const ch = raw.character as
    | { name?: string; level?: number; class?: { name?: string }; status?: { is_hardcore?: boolean } }
    | undefined;
  if (!ch || typeof ch.name !== "string") return null;
  return {
    name: ch.name,
    className: ch.class?.name ?? "",
    level: typeof ch.level === "number" ? ch.level : 0,
    hardcore: ch.status?.is_hardcore === true,
    lastUpdated: typeof raw.lastUpdated === "number" ? raw.lastUpdated : null,
  };
}

export function AccountSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5" aria-busy="true">
      <div className="skelett h-28 rounded-[var(--radius-panel)]" />
      <div className="skelett h-64 rounded-[var(--radius-panel)]" />
    </div>
  );
}

export function AccountView() {
  const params = useSearchParams();
  const key = params?.toString() ?? "";
  const [state, setState] = useState<{ key: string; value: State } | null>(null);
  const [retry, setRetry] = useState(0);

  const p = new URLSearchParams(key);
  const name = (p.get("name") ?? "").trim();
  const { season } = readScope(p);

  useEffect(() => {
    if (!name) return;
    const ac = new AbortController();
    getAccount(name, season, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        const rows = (r.characters ?? []).map(toRow).filter((x): x is Row => x !== null);
        setState({ key, value: { status: "ready", rows } });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ key, value: { status: "failed" } });
      });
    return () => ac.abort();
    // `key` is the identity of name and season.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  const current: State = !name ? { status: "ready", rows: [] } : state?.key === key ? state.value : { status: "loading" };
  if (current.status === "loading") return <AccountSkeleton />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="kaskade-karten flex flex-col gap-5">
        <header className="karte flex flex-col gap-1 p-6">
          <p className="font-mono text-xs tracking-[0.14em] text-accent-text">ACCOUNT</p>
          <h1 className="truncate text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink">
            {name ? displayName(name) : "Account"}
          </h1>
          {current.status === "ready" && current.rows.length > 0 && (
            <p className="mt-1 text-sm text-ink-soft">
              {`${current.rows.length} ${current.rows.length === 1 ? "character" : "characters"} this season`}
            </p>
          )}
        </header>

        {current.status === "failed" ? (
          <div role="alert" className="flex items-center gap-3 rounded-full bg-[var(--danger-bg)] py-1.5 pr-1.5 pl-4 text-sm text-danger">
            <span>Could not load this account.</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setState(null);
                setRetry((n) => n + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : current.rows.length === 0 ? (
          <section className="mat-thick flex flex-col gap-4 rounded-[var(--radius-panel)] p-5">
            <p className="text-sm text-ink-soft">No tracked characters for this account yet.</p>
            <AddAccount initial={name} />
          </section>
        ) : (
          <ul className="mat-thick flex flex-col gap-1 rounded-[var(--radius-panel)] p-2" aria-label="Characters">
            {current.rows.map((c) => {
              const mode = c.hardcore ? "hardcore" : "softcore";
              const href = `/builds/character?name=${encodeURIComponent(c.name)}${season === null ? "" : `&season=${season}`}&gameMode=${mode}`;
              return (
                <li key={c.name}>
                  <a
                    href={href}
                    className="drueckbar flex items-center gap-3 rounded-2xl p-3 outline-none hover:bg-well focus-visible:outline-2 focus-visible:outline-accent-text"
                  >
                    <span className="well inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={classIconUrl(c.className)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-ink">{displayName(c.name)}</span>
                      <span className="text-xs text-ink-soft">{`Level ${c.level} ${c.className}`}</span>
                    </span>
                    {c.hardcore && <Chip>Hardcore</Chip>}
                    {c.lastUpdated !== null && (
                      <span className="hidden text-xs text-muted-ink sm:inline">
                        {`Updated ${formatAgo(new Date(c.lastUpdated).toISOString())}`}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <a href="/builds" className={buttonClass("ghost", "md", "self-start")}>
          Back to Builds
        </a>
      </div>
    </div>
  );
}
