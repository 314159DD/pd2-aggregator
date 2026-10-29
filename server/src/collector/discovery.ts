import type { Config } from '../config';
import type { AccountResponse, LadderResponse } from '../upstream/pd2-client';

export type LastIngest = Map<string, { lastIngestedAt: Date; experience: number }>;

const HOUR_MS = 3_600_000;

/** Ladder characters of an account that reached minLevel and were not ingested in the last 20 h. */
export function planFromAccount(
  details: AccountResponse['details'],
  lastIngest: LastIngest,
  now: Date,
  cfg: Pick<Config, 'minLevel'>,
): string[] {
  const cutoff = now.getTime() - 20 * HOUR_MS;
  return details
    .filter((d) => {
      if (!d.ladder || d.level < cfg.minLevel) return false;
      const last = lastIngest.get(d.name.toLowerCase());
      return !last || last.lastIngestedAt.getTime() < cutoff;
    })
    .map((d) => d.name);
}

/** Ladder names never ingested, or whose experience changed and were last ingested over 6 h ago. */
export function planFromLadder(ladder: LadderResponse, lastIngest: LastIngest, now: Date): string[] {
  const cutoff = now.getTime() - 6 * HOUR_MS;
  const out = new Map<string, string>();
  for (const mode of [ladder.softcore, ladder.hardcore]) {
    for (const list of Object.values(mode ?? {})) {
      for (const e of list ?? []) {
        const key = e.name.toLowerCase();
        if (out.has(key)) continue;
        const last = lastIngest.get(key);
        if (!last || (last.experience !== e.experience && last.lastIngestedAt.getTime() < cutoff)) {
          out.set(key, e.name);
        }
      }
    }
  }
  return [...out.values()];
}

/** All distinct names in a ladder response (for loading last-ingest data). */
export function ladderNames(ladder: LadderResponse): string[] {
  const out = new Map<string, string>();
  for (const mode of [ladder.softcore, ladder.hardcore]) {
    for (const list of Object.values(mode ?? {})) {
      for (const e of list ?? []) out.set(e.name.toLowerCase(), e.name);
    }
  }
  return [...out.values()];
}
