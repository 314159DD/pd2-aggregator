import { describe, it, expect } from 'vitest';
import { Pd2Client, UpstreamError, USER_AGENT } from '../src/upstream/pd2-client';
import { RateLimiter } from '../src/upstream/rate-limiter';

function setup(respond: () => Response) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let t = Date.parse('2026-10-28T22:00:00Z');
  const sleeps: number[] = [];
  const limiter = new RateLimiter({
    minIntervalMs: 1000,
    pauseStartHour: 12,
    pauseEndHour: 14,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  });
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers });
    return respond();
  }) as unknown as typeof fetch;
  return { client: new Pd2Client(limiter, fetchImpl, 'https://x.test'), calls, sleeps };
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('Pd2Client', () => {
  it('character 404 -> null', async () => {
    const { client } = setup(() => new Response('', { status: 404 }));
    expect(await client.character('x')).toBeNull();
  });
  it('character without body.character -> null', async () => {
    const { client } = setup(() => json({ error: 'no' }));
    expect(await client.character('x')).toBeNull();
  });
  it('503 -> retryable UpstreamError', async () => {
    const { client } = setup(() => new Response('', { status: 503 }));
    const e = await client.online().catch((x) => x);
    expect(e).toBeInstanceOf(UpstreamError);
    expect(e.retryable).toBe(true);
    expect(e.status).toBe(503);
  });
  it('html 200 -> UpstreamError', async () => {
    const { client } = setup(
      () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(client.ladder()).rejects.toBeInstanceOf(UpstreamError);
  });
  it('encodes names and sends UA', async () => {
    const { client, calls } = setup(() => json({ character: { name: 'a b' } }));
    await client.character('a b');
    expect(calls[0].url.endsWith('/game/character/a%20b')).toBe(true);
    expect(calls[0].headers['User-Agent']).toBe(USER_AGENT);
  });
  it('listings builds query', async () => {
    const { client, calls } = setup(() => json({ total: 0, data: [] }));
    await client.listings({ limit: 50, skip: 100, sortBumpedDesc: true });
    const u = new URL(calls[0].url);
    expect(u.searchParams.get('$limit')).toBe('50');
    expect(u.searchParams.get('$skip')).toBe('100');
    expect(u.searchParams.get('$sort[bumped_at]')).toBe('-1');
  });
  it('failure triggers backoff, 404 counts as success and resets it', async () => {
    let status = 500;
    const { client, sleeps } = setup(() => new Response('', { status }));
    await client.online().catch(() => {});
    status = 404;
    await client.character('x'); // waits 1000 + 10000
    expect(sleeps[0]).toBe(11000);
    await client.character('x'); // backoff reset
    expect(sleeps[1]).toBe(1000);
  });
});
