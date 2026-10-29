import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { CharQueue } from '../src/collector/queue';
import { planFromAccount, planFromLadder } from '../src/collector/discovery';
import { ingestOne } from '../src/collector/ingest';
import { accountsDue, markAccountChecked, takePriorityAccounts, addPriorityAccount } from '../src/db/status-repo';
import { UpstreamError } from '../src/upstream/pd2-client';
import account from './fixtures/account.json';
import ladder from './fixtures/ladder.json';
import charLadder from './fixtures/character-ladder.json';
import charNonLadder from './fixtures/character-nonladder.json';

const now = new Date('2026-10-29T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('CharQueue', () => {
  it('orders by priority, fifo within, dedupes case-insensitively', () => {
    const q = new CharQueue();
    expect(q.push({ name: 'a', priority: 2 })).toBe(true);
    expect(q.push({ name: 'b', priority: 1 })).toBe(true);
    expect(q.push({ name: 'c', priority: 0 })).toBe(true);
    expect(q.push({ name: 'D', priority: 1 })).toBe(true);
    expect(q.push({ name: 'A', priority: 0 })).toBe(false);
    expect(q.size).toBe(4);
    expect([q.shift()?.name, q.shift()?.name, q.shift()?.name, q.shift()?.name]).toEqual(['c', 'b', 'D', 'a']);
    expect(q.shift()).toBeUndefined();
    expect(q.push({ name: 'a', priority: 0 })).toBe(true);
  });
});

describe('planning', () => {
  it('planFromAccount keeps ladder, level >= min, not fresh', () => {
    const details = (account as any).details;
    const eligible = details.filter((d: any) => d.ladder && d.level >= 80).map((d: any) => d.name);
    expect(eligible.length).toBeGreaterThan(0);
    expect(planFromAccount(details, new Map(), now, { minLevel: 80 })).toEqual(eligible);
    const fresh = new Map([[eligible[0].toLowerCase(), { lastIngestedAt: hoursAgo(1), experience: 1 }]]);
    expect(planFromAccount(details, fresh, now, { minLevel: 80 })).toEqual(eligible.slice(1));
    const stale = new Map([[eligible[0].toLowerCase(), { lastIngestedAt: hoursAgo(21), experience: 1 }]]);
    expect(planFromAccount(details, stale, now, { minLevel: 80 })).toEqual(eligible);
    expect(planFromAccount(details, new Map(), now, { minLevel: 100 })).toEqual([]);
  });

  it('planFromLadder picks changed+old and never-ingested, skips unchanged', () => {
    const e = (name: string, experience: number) => ({ name, rank: 1, class: 'x', level: 99, experience, dead: false });
    const l = {
      updated_at: 0,
      softcore: { overall: [e('Changed', 200), e('Same', 100), e('ChangedFresh', 200), e('New', 5)] },
      hardcore: { overall: [e('hcnew', 5)], Druid: [e('New', 5)] },
    };
    const last = new Map([
      ['changed', { lastIngestedAt: hoursAgo(7), experience: 100 }],
      ['same', { lastIngestedAt: hoursAgo(7), experience: 100 }],
      ['changedfresh', { lastIngestedAt: hoursAgo(1), experience: 100 }],
    ]);
    expect(planFromLadder(l, last, now)).toEqual(['Changed', 'New', 'hcnew']);
    expect(planFromLadder(ladder as any, new Map(), now).length).toBeGreaterThan(0);
  });
});

describe('db-backed', () => {
  let pool: Pool;
  beforeEach(async () => { pool = await freshDb(); });
  afterEach(async () => { await pool.end(); });
  const cfg = { currentSeason: 14, minLevel: 80 };

  it('ingestOne skips non-ladder and null, ingests ladder', async () => {
    const q = new CharQueue();
    const mk = (r: any) => ({ pool, queue: q, cfg, client: { character: async () => r } as any });
    expect(await ingestOne(mk(charNonLadder), { name: 'x', priority: 1 })).toBe('skipped');
    expect(await ingestOne(mk(null), { name: 'x', priority: 1 })).toBe('skipped');
    expect(await ingestOne(mk({ character: null }), { name: 'x', priority: 1 })).toBe('skipped');
    expect((await pool.query('select count(*)::int n from characters')).rows[0].n).toBe(0);
    expect(await ingestOne(mk(charLadder), { name: 'x', account: 'ACC', priority: 1 })).toBe('ingested');
    const r = await pool.query('select account from characters');
    expect(r.rows).toEqual([{ account: 'ACC' }]);
  });

  it('ingestOne requeues a retryable error once, then fails', async () => {
    const q = new CharQueue();
    const deps = {
      pool, queue: q, cfg,
      client: { character: async () => { throw new UpstreamError('boom', 503, true); } } as any,
    };
    expect(await ingestOne(deps, { name: 'x', priority: 1 })).toBe('skipped');
    expect(q.size).toBe(1);
    const again = q.shift()!;
    expect(again.attempts).toBe(1);
    expect(await ingestOne(deps, again)).toBe('failed');
    expect(q.size).toBe(0);
    const nonRetry = { ...deps, client: { character: async () => { throw new UpstreamError('bad', 400, false); } } as any };
    expect(await ingestOne(nonRetry, { name: 'y', priority: 1 })).toBe('failed');
    expect(q.size).toBe(0);
  });

  it('accountsDue excludes recently checked; priority accounts are taken once', async () => {
    await markAccountChecked(pool, 'recent', hoursAgo(1));
    await markAccountChecked(pool, 'old', hoursAgo(30));
    expect(await accountsDue(pool, ['recent', 'old', 'never'], now)).toEqual(['old', 'never']);
    await addPriorityAccount(pool, 'p1', '1.2.3.4');
    await addPriorityAccount(pool, 'p1', null);
    expect(await takePriorityAccounts(pool)).toEqual(['p1']);
    expect(await takePriorityAccounts(pool)).toEqual([]);
  });
});
