"use client";

import { useState } from "react";
import { Button } from "@/components/lx/Button";
import { queueAccount } from "@/lib/builds/api";
import { displayName } from "@/lib/builds/display-name";
import { formatAgo, formatHr } from "@/lib/builds/format";
import { classIconUrl } from "@/lib/builds/item-art";

export type HeaderInfo = {
  name: string;
  className: string;
  level: number;
  mode: "softcore" | "hardcore";
  season: number;
  seasonName: string | null;
  account: string | null;
  lastIngestedAt: string;
  gearValueHr: number | null;
  gearPartial: boolean;
  mercValueHr: number | null;
  archive: boolean;
};

type Notice = { text: string; tone: "ok" | "bad" } | null;

export function CharacterHeader({ info }: { info: HeaderInfo }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [iconFailed, setIconFailed] = useState(false);

  const refresh = async () => {
    if (!info.account) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await queueAccount(info.account);
      setNotice(
        r === "queued"
          ? { text: "Queued. Fresh data within a few minutes.", tone: "ok" }
          : r === "rate-limited"
            ? { text: "Too many requests, try again later.", tone: "bad" }
            : { text: "This account name cannot be refreshed.", tone: "bad" },
      );
    } catch {
      setNotice({ text: "Could not queue the refresh.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const season = info.seasonName ? `${info.seasonName} (S${info.season})` : `Season ${info.season}`;
  return (
    <header className="karte flex flex-wrap items-center gap-x-6 gap-y-4 p-6">
      {!iconFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={classIconUrl(info.className)}
          alt=""
          width={64}
          height={64}
          onError={() => setIconFailed(true)}
          className="well size-16 shrink-0 rounded-2xl object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs tracking-[0.14em] text-accent-text">CHARACTER</p>
        <h1 className="mt-1 truncate text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink">
          {displayName(info.name)}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Level <span className="font-mono tabular-nums">{info.level}</span> {info.className} · {info.mode === "hardcore" ? "Hardcore" : "Softcore"} ·{" "}
          {season}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {info.account && (
            <a
              href={`/builds/account?name=${encodeURIComponent(info.account)}&season=${info.season}`}
              className="text-accent-text hover:underline"
            >
              {info.account}
            </a>
          )}
          <a
            href={`https://www.projectdiablo2.com/character/${encodeURIComponent(info.name)}`}
            target="_blank"
            rel="noopener"
            className="text-accent-text hover:underline"
          >
            View on projectdiablo2.com
          </a>
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {info.gearValueHr !== null && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-well px-[11px] text-xs font-medium text-ink-soft">
              Gear&nbsp;<span className="font-mono text-ink tabular-nums">{formatHr(info.gearValueHr)} HR{info.gearPartial ? "+" : ""}</span>
            </span>
          )}
          {info.mercValueHr !== null && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-well px-[11px] text-xs font-medium text-ink-soft">
              Merc&nbsp;<span className="font-mono text-ink tabular-nums">{formatHr(info.mercValueHr)} HR</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-ink">{info.archive ? "Archived season" : `Updated ${formatAgo(info.lastIngestedAt)}`}</span>
          {!info.archive && (
            <Button size="sm" variant="secondary" onClick={refresh} disabled={!info.account || busy} title={info.account ? undefined : "Account unknown"}>
              Refresh
            </Button>
          )}
        </div>
        <p role="status" className={`min-h-4 text-xs ${notice?.tone === "bad" ? "text-danger" : "text-ink-soft"}`}>
          {notice?.text}
        </p>
      </div>
    </header>
  );
}
