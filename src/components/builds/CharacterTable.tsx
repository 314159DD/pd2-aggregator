"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/lx/Button";
import { displayName } from "@/lib/builds/display-name";
import { formatCount, formatHr } from "@/lib/builds/format";
import { classIconUrl } from "@/lib/builds/item-art";
import type { Scope } from "@/lib/builds/scope";
import type { BuildRow, BuildsCharactersPage } from "@/lib/builds/types";
import { setSort, type BuildsSort, type BuildsState } from "@/lib/builds/url-state";
import { ItemIcon, SkillIcon } from "./ItemIcon";
import { RowPreview, type PreviewCache } from "./RowPreview";

type Props = { page: BuildsCharactersPage; state: BuildsState; onChange: (next: BuildsState) => void; archive?: boolean };

const COLS = 7;
const MAX_GEAR_ICONS = 6;

function SortHeader({ label, col, page, onSort }: { label: string; col: BuildsSort; page: BuildsCharactersPage; onSort: (c: BuildsSort) => void }) {
  const active = page.sort === col;
  const aria = active ? (page.dir === "desc" ? "descending" : "ascending") : "none";
  return (
    <th scope="col" aria-sort={aria} className="text-right">
      <button
        type="button"
        onClick={() => onSort(col)}
        className="drueckbar inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-soft outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-text"
        style={active ? { color: "var(--ink)" } : undefined}
      >
        {label}
        <span aria-hidden className="w-2 text-[10px]">{active ? (page.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

function Row({ c, open, onToggle, previewId, scope, cache, archive }: {
  c: BuildRow;
  archive: boolean;
  open: boolean;
  onToggle: () => void;
  previewId: string;
  scope: Scope;
  cache: PreviewCache;
}) {
  return (
    <tbody>
      <tr
        tabIndex={0}
        aria-expanded={open}
        aria-controls={previewId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer outline-none focus-visible:bg-well focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
      >
        <td>
          <div className="flex min-w-0 items-center gap-3">
            <span className="well inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={classIconUrl(c.className)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{displayName(c.name)}</span>
              <span className="text-xs text-ink-soft">{c.className}</span>
            </div>
          </div>
        </td>
        <td className="text-right font-mono text-ink tabular-nums">{c.level}</td>
        <td className="text-right font-mono text-ink tabular-nums">{c.life === null ? "-" : formatCount(c.life)}</td>
        <td>
          <div className="flex items-center gap-1.5">
            {c.topSkills.slice(0, 3).map((s) => (
              <span key={s.name} title={`${s.name} (${s.hardLevel})`}>
                <SkillIcon name={s.name} />
              </span>
            ))}
            {c.topSkills.length === 0 && <span className="text-ink-soft">-</span>}
          </div>
        </td>
        <td>
          <div className="flex items-center gap-1">
            {c.keyGear.slice(0, MAX_GEAR_ICONS).map((g, i) => (
              <span key={`${g.name}-${i}`} title={g.name} className="shrink-0">
                <ItemIcon item={g} />
              </span>
            ))}
            {c.keyGear.length > MAX_GEAR_ICONS && (
              <span
                data-testid="gear-more"
                title={c.keyGear.slice(MAX_GEAR_ICONS).map((g) => g.name).join(", ")}
                className="shrink-0 font-mono text-xs text-ink-soft tabular-nums"
              >
                +{c.keyGear.length - MAX_GEAR_ICONS}
              </span>
            )}
            {c.keyGear.length === 0 && <span className="text-ink-soft">-</span>}
          </div>
        </td>
        {!archive && (
          <td className="min-w-[5rem] text-right font-mono whitespace-nowrap text-ink tabular-nums">
            {c.gearValueHr === null ? "-" : `${formatHr(c.gearValueHr)}${c.gearValuePartial ? "+" : ""}`}
          </td>
        )}
        <td className="text-ink-soft">
          <span aria-hidden className="aufklapp-pfeil inline-block">›</span>
        </td>
      </tr>
      <tr>
        <td colSpan={archive ? COLS - 1 : COLS} id={previewId} className="min-w-0 overflow-hidden p-0! border-t-0!">
          <div className="aufklapp-inhalt" data-offen={open ? "" : undefined}>
            <div>{open && <RowPreview name={c.name} scope={scope} cache={cache} />}</div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export function CharacterTable({ page, state, onChange, archive = false }: Props) {
  const top = useRef<HTMLDivElement>(null);
  const [openName, setOpenName] = useState<string | null>(null);
  const { season, gameMode } = state;
  const scope = useMemo<Scope>(() => ({ season, gameMode }), [season, gameMode]);
  // New page of rows or new scope: the cache belongs to the old ones.
  const cache = useMemo<PreviewCache>(() => new Map(), [page, season, gameMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Store-previous-key pattern: close the open preview in the same render, so no stale frame shows.
  const [prevKey, setPrevKey] = useState<{ page: BuildsCharactersPage; season: number | null; gameMode: string }>({ page, season, gameMode });
  if (prevKey.page !== page || prevKey.season !== season || prevKey.gameMode !== gameMode) {
    setPrevKey({ page, season, gameMode });
    setOpenName(null);
  }

  const go = (target: number) => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    onChange({ ...state, page: target });
  };

  const pages = Math.max(1, page.pages);
  const current = page.total === 0 ? 1 : page.page;

  return (
    <div ref={top} className="mat-thick flex scroll-mt-24 flex-col gap-3 rounded-[var(--radius-panel)] p-5" aria-label="Characters" role="region">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Characters</h2>
        <span className="font-mono text-xs text-ink-soft tabular-nums">{formatCount(page.total)} characters match</span>
      </div>

      {page.characters.length === 0 && page.total > 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-ink-soft">
          <p>Page out of range</p>
          <Button size="sm" onClick={() => go(1)}>Go to page 1</Button>
        </div>
      ) : page.characters.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">No characters match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabelle kaskade-zeilen min-w-[50rem] table-fixed">
            <colgroup>
              <col />
              <col className="w-[3.5rem]" />
              <col className="w-[5rem]" />
              <col className="w-[8rem]" />
              <col className="w-[14rem]" />
              {!archive && <col className="w-[6rem]" />}
              <col className="w-[2rem]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Character</th>
                <SortHeader label="Lvl" col="level" page={page} onSort={(c) => onChange(setSort(state, c))} />
                <SortHeader label="Life" col="life" page={page} onSort={(c) => onChange(setSort(state, c))} />
                <th scope="col">Top skills</th>
                <th scope="col">Key gear</th>
                {!archive && <SortHeader label="Gear HR" col="gear" page={page} onSort={(c) => onChange(setSort(state, c))} />}
                <th scope="col"><span className="sr-only">Preview</span></th>
              </tr>
            </thead>
            {page.characters.map((c, i) => (
              <Row
                key={`${c.name}-${i}`}
                c={c}
                open={openName === c.name}
                onToggle={() => setOpenName(openName === c.name ? null : c.name)}
                previewId={`preview-${i}`}
                scope={scope}
                cache={cache}
                archive={archive}
              />
            ))}
          </table>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 pt-1">
        <Button size="sm" disabled={current <= 1} onClick={() => go(current - 1)}>‹ Prev</Button>
        <span className="font-mono text-xs text-ink-soft tabular-nums">Page {formatCount(current)} of {formatCount(pages)}</span>
        <Button size="sm" disabled={current >= pages} onClick={() => go(current + 1)}>Next ›</Button>
      </div>
    </div>
  );
}
