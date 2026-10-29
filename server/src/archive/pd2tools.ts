import { InvalidCharacterPayload, toCompact } from '../core/compact';
import type { CharacterApiResponse } from '../core/vendor/types';
import type { RateLimiter } from '../upstream/rate-limiter';
import { USER_AGENT } from '../upstream/pd2-client';
import type { ArchiveRow } from './write';

export const PD2TOOLS_BASE = 'https://api.pd2.tools/api/v1';
const MAX_ATTEMPTS = 5;

export type HttpGet = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>;
export type ArchivePage = { total: number; breakdown: Record<string, number>; characters: unknown[] };

export class ArchiveFetchError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message);
    this.name = 'ArchiveFetchError';
  }
}

export const defaultHttpGet: HttpGet = (url) =>
  fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });

export function archivePageUrl(season: number, mode: 'softcore' | 'hardcore', page: number, pageSize = 50): string {
  return `${PD2TOOLS_BASE}/characters?season=${season}&gameMode=${mode}&page=${page}&pageSize=${pageSize}`;
}

export async function fetchArchivePage(
  http: HttpGet,
  limiter: RateLimiter,
  q: { season: number; mode: 'softcore' | 'hardcore'; page: number; pageSize?: number },
): Promise<ArchivePage> {
  const url = archivePageUrl(q.season, q.mode, q.page, q.pageSize);
  let last = 'no attempt';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: { status: number; json(): Promise<unknown> };
    try {
      res = await limiter.schedule(() => http(url));
    } catch (e) {
      limiter.reportFailure();
      last = `network error: ${(e as Error).message}`;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      limiter.reportFailure();
      last = `status ${res.status}`;
      continue;
    }
    if (res.status !== 200) throw new ArchiveFetchError(`GET ${url} returned ${res.status}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      limiter.reportFailure();
      last = `unreadable body: ${(e as Error).message}`;
      continue;
    }
    const b = body as { total?: unknown; characters?: unknown; breakdown?: unknown } | null;
    if (!b || typeof b.total !== 'number' || !Array.isArray(b.characters)) {
      throw new ArchiveFetchError(`GET ${url} returned an unexpected body`, 200);
    }
    limiter.reportSuccess();
    const breakdown = b.breakdown && typeof b.breakdown === 'object' ? (b.breakdown as Record<string, number>) : {};
    return { total: b.total, breakdown, characters: b.characters };
  }
  throw new ArchiveFetchError(`GET ${url} failed after ${MAX_ATTEMPTS} attempts (${last})`);
}

export type MappedCharacter = { kind: 'ok'; row: ArchiveRow } | { kind: 'below_min' } | { kind: 'invalid' };

export function toArchiveCompact(raw: unknown, mode: 'softcore' | 'hardcore', minLevel: number): MappedCharacter {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'invalid' };
  const r = raw as { accountName?: unknown; lastUpdated?: unknown };
  let compact;
  try {
    const account = typeof r.accountName === 'string' && r.accountName ? r.accountName : undefined;
    compact = toCompact(raw as CharacterApiResponse, account);
  } catch (e) {
    if (e instanceof InvalidCharacterPayload) return { kind: 'invalid' };
    throw e;
  }
  if (typeof compact.name !== 'string' || !compact.name || !Number.isFinite(compact.level)) return { kind: 'invalid' };
  if (compact.level < minLevel) return { kind: 'below_min' };
  compact.mode = mode;
  const ms = typeof r.lastUpdated === 'number' && Number.isFinite(r.lastUpdated) ? r.lastUpdated : null;
  const lastUpdated = ms !== null && !Number.isNaN(new Date(ms).getTime()) ? new Date(ms) : new Date();
  return { kind: 'ok', row: { compact, raw: raw as object, lastUpdated } };
}
