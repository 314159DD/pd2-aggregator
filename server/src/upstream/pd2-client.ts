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

export class Pd2Client {
  constructor(
    private limiter: RateLimiter,
    private fetchImpl: typeof fetch = fetch,
    private base = 'https://api.projectdiablo2.com',
  ) {}

  /** Returns parsed JSON, or null on 404. Throws UpstreamError otherwise. */
  private request(path: string): Promise<unknown | null> {
    return this.limiter.schedule(async () => {
      const url = `${this.base}${path}`;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
      } catch (e) {
        this.limiter.reportFailure();
        throw new UpstreamError(`Network error for ${path}: ${(e as Error).message}`, null, true);
      }
      if (res.status === 404) {
        this.limiter.reportSuccess();
        return null;
      }
      if (!res.ok) {
        this.limiter.reportFailure();
        throw new UpstreamError(
          `HTTP ${res.status} for ${path}`,
          res.status,
          res.status >= 500 || res.status === 429 || res.status === 408,
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        this.limiter.reportFailure();
        throw new UpstreamError(`Non-JSON response for ${path}`, res.status, true);
      }
      this.limiter.reportSuccess();
      return body;
    });
  }

  private async required<T>(path: string): Promise<T> {
    const body = await this.request(path);
    if (body === null) throw new UpstreamError(`HTTP 404 for ${path}`, 404, false);
    return body as T;
  }

  online(): Promise<string[]> {
    return this.required<string[]>('/game/online');
  }

  account(name: string): Promise<AccountResponse> {
    return this.required<AccountResponse>(`/game/account/${encodeURIComponent(name)}`);
  }

  async character(name: string): Promise<CharacterApiResponse | null> {
    const body = (await this.request(`/game/character/${encodeURIComponent(name)}`)) as
      | (Partial<CharacterApiResponse> & Record<string, unknown>)
      | null;
    if (!body || !body.character) return null;
    return body as CharacterApiResponse;
  }

  ladder(): Promise<LadderResponse> {
    return this.required<LadderResponse>('/game/ladder');
  }

  season(): Promise<{ name: string; start: string }> {
    return this.required<{ name: string; start: string }>('/game/season');
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
    return this.required(`/market/listing?${params.toString()}`);
  }
}
