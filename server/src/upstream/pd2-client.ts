import type { CharacterApiResponse } from '../core/vendor/types';
import type { RateLimiter } from './rate-limiter';

export const USER_AGENT = 'pd2meta.info/2.0 (+https://www.pd2meta.info)';

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public retryable: boolean,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export type LadderEntry = {
  name: string;
  rank: number;
  class: string;
  level: number;
  experience: number;
  dead: boolean;
};

export type LadderResponse = {
  updated_at: number;
  softcore: Record<string, LadderEntry[]>;
  hardcore: Record<string, LadderEntry[]>;
};

export type RawListing = {
  _id: string;
  item: unknown;
  price: string;
  is_ladder: boolean;
  is_hardcore: boolean;
  created_at: string;
  bumped_at: string;
};

export type AccountResponse = {
  characters: string[];
  details: Array<{
    name: string;
    level: number;
    ladder: boolean;
    hardcore: boolean;
    class_name: string;
  }>;
};

function isObject(b: unknown): b is Record<string, unknown> {
  return typeof b === 'object' && b !== null && !Array.isArray(b);
}

export class Pd2Client {
  private timeoutMs: number;

  constructor(
    private limiter: RateLimiter,
    private fetchImpl: typeof fetch = fetch,
    private base = 'https://api.projectdiablo2.com',
    opts: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /**
   * Returns parsed JSON, or null on 404. Throws UpstreamError otherwise.
   * `valid` rejects odd 200 bodies (retryable failure).
   */
  private request(path: string, valid?: (body: unknown) => boolean): Promise<unknown | null> {
    return this.limiter.schedule(async () => {
      const url = `${this.base}${path}`;
      let status: number;
      let ok: boolean;
      let text = '';
      try {
        const res = await this.fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        status = res.status;
        ok = res.ok;
        if (status !== 404 && ok) text = await res.text();
      } catch (e) {
        this.limiter.reportFailure();
        throw new UpstreamError(`Network error or timeout for ${path}: ${(e as Error).message}`, null, true);
      }
      if (status === 404) {
        this.limiter.reportSuccess();
        return null;
      }
      if (!ok) {
        this.limiter.reportFailure();
        throw new UpstreamError(
          `HTTP ${status} for ${path}`,
          status,
          status >= 500 || status === 429 || status === 408,
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        this.limiter.reportFailure();
        throw new UpstreamError(`Non-JSON response for ${path}`, status, true);
      }
      if (valid && !valid(body)) {
        this.limiter.reportFailure();
        throw new UpstreamError(`Unexpected response shape for ${path}`, status, true);
      }
      this.limiter.reportSuccess();
      return body;
    });
  }

  private async required<T>(path: string, valid: (body: unknown) => boolean): Promise<T> {
    const body = await this.request(path, valid);
    if (body === null) throw new UpstreamError(`HTTP 404 for ${path}`, 404, false);
    return body as T;
  }

  online(): Promise<string[]> {
    return this.required<string[]>('/game/online', Array.isArray);
  }

  async account(name: string): Promise<AccountResponse> {
    const body = (await this.request(
      `/game/account/${encodeURIComponent(name)}`,
      (b) => isObject(b) && Array.isArray(b.characters),
    )) as { characters: string[]; details?: AccountResponse['details'] } | null;
    if (body === null) return { characters: [], details: [] };
    return { characters: body.characters, details: Array.isArray(body.details) ? body.details : [] };
  }

  async character(name: string): Promise<CharacterApiResponse | null> {
    const body = (await this.request(`/game/character/${encodeURIComponent(name)}`)) as
      | (Partial<CharacterApiResponse> & Record<string, unknown>)
      | null;
    if (!body || !body.character) return null;
    return body as CharacterApiResponse;
  }

  ladder(): Promise<LadderResponse> {
    return this.required<LadderResponse>(
      '/game/ladder',
      (b) => isObject(b) && isObject(b.softcore) && isObject(b.hardcore),
    );
  }

  season(): Promise<{ name: string; start: string }> {
    return this.required<{ name: string; start: string }>(
      '/game/season',
      (b) => isObject(b) && typeof b.name === 'string' && typeof b.start === 'string',
    );
  }

  listings(q: {
    limit: number;
    skip: number;
    sortBumpedDesc: boolean;
  }): Promise<{ total: number; data: RawListing[] }> {
    const params = new URLSearchParams();
    params.set('$limit', String(q.limit));
    params.set('$skip', String(q.skip));
    if (q.sortBumpedDesc) params.set('$sort[bumped_at]', '-1');
    return this.required(
      `/market/listing?${params.toString()}`,
      (b) => isObject(b) && Array.isArray(b.data) && typeof b.total === 'number',
    );
  }
}
