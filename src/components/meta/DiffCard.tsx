import { buttonClass } from "@/components/lx/Button";
import { formatPct } from "@/lib/builds/format";
import { displayName } from "@/lib/builds/display-name";
import { qualityClass } from "@/lib/builds/quality";
import type { MetaState } from "@/lib/meta/state";
import { META_SLOTS, type CharacterDiff, type MetaSlot, type TopItem } from "@/lib/meta/types";
import { MetaCard, cap, fin } from "./shared";

const MODE_LABEL = { softcore: "Softcore", hardcore: "Hardcore" } as const;

function Chip({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap"
      style={{
        background: ok ? "var(--ok-bg)" : "var(--warn-bg)",
        color: ok ? "var(--ok)" : "var(--warn)",
      }}
    >
      {ok ? "Matches the top pick" : "Differs"}
    </span>
  );
}

/** Quality colour of the cohort's top pick, looked up in the cohort when it is passed in. */
function poolQuality(pool: Record<MetaSlot, TopItem[]> | undefined, slot: MetaSlot, name: string): string {
  const hit = pool?.[slot]?.find((i) => i.itemName === name);
  return hit ? qualityClass(hit.itemType) : "text-ink";
}

export function DiffCard({
  diff,
  notFoundName,
  state,
  season,
  pool,
}: {
  diff: CharacterDiff | null;
  notFoundName?: string;
  state: MetaState;
  season?: number | null;
  pool?: Record<MetaSlot, TopItem[]>;
}) {
  if (!diff) {
    const name = notFoundName ?? state.char;
    const s = state.season ?? season ?? null;
    const href = `/builds/account?name=${encodeURIComponent(name)}${s !== null ? `&season=${s}` : ""}`;
    return (
      <MetaCard title="Your character vs the cohort" className="lg:col-span-12">
        <p className="text-sm text-ink-soft" role="status">{`No character or account named "${displayName(name)}" this season.`}</p>
        <a href={href} className={buttonClass("secondary", "sm", "self-start")}>
          Track this account
        </a>
      </MetaCard>
    );
  }

  const mode = diff.mode;
  const crossMode = mode !== state.gameMode && (mode === "softcore" || mode === "hardcore");
  return (
    <MetaCard title="Your character vs the cohort" className="lg:col-span-12">
      <p className="text-sm text-ink-soft">
        {`${displayName(diff.characterName)} · Level ${fin(diff.characterLevel)} ${diff.className} · ${MODE_LABEL[mode] ?? cap(String(mode))}`}
      </p>
      {crossMode && (
        <p role="status" className="well self-start rounded-xl px-3 py-1.5 text-sm text-ink-soft">
          {`Found in ${MODE_LABEL[mode]}; compared against the ${MODE_LABEL[mode]} pool.`}
        </p>
      )}
      <div className="mat-thick overflow-x-auto rounded-2xl">
        <table className="tabelle min-w-[44rem]">
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Yours</th>
              <th scope="col">Cohort top</th>
              <th scope="col">Match</th>
              <th scope="col">Top affixes</th>
            </tr>
          </thead>
          <tbody>
            {META_SLOTS.map((slot) => {
              const d = diff.slots?.[slot];
              if (!d) return null;
              const both = d.userItemName !== null && d.poolTopItemName !== null;
              return (
                <tr key={slot}>
                  <td className="text-sm font-medium text-ink">{cap(slot)}</td>
                  <td className={`text-sm ${d.userItemName ? qualityClass(d.userItemQuality ?? "") : "text-muted-ink"}`}>
                    {d.userItemName ?? "-"}
                  </td>
                  <td className={`text-sm ${d.poolTopItemName ? poolQuality(crossMode ? undefined : pool, slot, d.poolTopItemName) : "text-muted-ink"}`}>
                    {d.poolTopItemName ?? "-"}
                  </td>
                  <td>{both ? <Chip ok={d.userMatchesPoolTop} /> : null}</td>
                  <td>
                    <ul className="flex flex-wrap gap-1.5">
                      {(d.poolTopAffixMods ?? []).slice(0, 5).map((m) => (
                        <li
                          key={m.modName}
                          className={`well inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${m.userHas ? "text-ink" : "text-muted-ink"}`}
                        >
                          <span
                            role="img"
                            aria-label={m.userHas ? "You have it" : "You do not have it"}
                            style={m.userHas ? { color: "var(--ok)" } : undefined}
                          >
                            {m.userHas ? "✓" : "✗"}
                          </span>
                          {m.displayLabel}
                          <span className="font-mono tabular-nums">{formatPct(fin(m.pct) * 100)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <span>{`Merc: ${diff.userMercType ?? "-"} (cohort: ${diff.poolMercType ?? "-"})`}</span>
        <Chip ok={diff.mercTypeMatchesPool ?? null} />
      </p>
    </MetaCard>
  );
}
