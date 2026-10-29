import { loadConfig } from '../config';
import { backfillAccount, getLastIngest } from '../db/characters-repo';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import {
  accountsDue,
  heartbeat,
  isPaused,
  markAccountChecked,
  listPriorityAccounts,
  removePriorityAccount,
  type CollectorStats,
} from '../db/status-repo';
import { Pd2Client, UpstreamError } from '../upstream/pd2-client';
import { RateLimiter } from '../upstream/rate-limiter';
import { ladderNames, planFromAccount, planFromLadder } from './discovery';
import { ingestOne } from './ingest';
import { CharQueue } from './queue';
import { fullSweep, pollIncremental } from './market-poller';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Timestamps pruned to the last hour. */
class RollingCounter {
  private stamps: number[] = [];
  add(now = Date.now()): void {
    this.stamps.push(now);
  }
  count(now = Date.now()): number {
    const cutoff = now - HOUR;
    while (this.stamps.length && this.stamps[0] < cutoff) this.stamps.shift();
    return this.stamps.length;
  }
}

const log = (level: 'info' | 'error', msg: string, extra?: unknown) =>
  (level === 'error' ? console.error : console.log)(
    `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`,
    ...(extra === undefined ? [] : [extra]),
  );

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const pool = createPool(cfg.databaseUrl);
  pool.on('error', (e) => log('error', 'idle pg client error', e));
  await migrate(pool);

  const limiter = new RateLimiter({
    minIntervalMs: cfg.pd2MinIntervalMs,
    pauseStartHour: cfg.pauseStartHour,
    pauseEndHour: cfg.pauseEndHour,
  });
  const client = new Pd2Client(limiter);
  const queue = new CharQueue();
  let firstOnlineSweep = true;

  let stopping = false;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const ingested = new RollingCounter();
  const errors = new RollingCounter();
  const requestSamples: Array<{ at: number; count: number }> = [{ at: Date.now(), count: 0 }];
  let firstSeason: string | null = null;
  const stats: CollectorStats = {
    requestsTotal: 0,
    requestsLastHour: 0,
    queueSize: 0,
    ingestedLastHour: 0,
    lastIngestAt: null,
    lastOnlineSweepAt: null,
    lastLadderPassAt: null,
    lastMarketPollAt: null,
    lastFullMarketSweepAt: null,
    errorsLastHour: 0,
    seasonName: null,
  };

  const active = async () => cfg.collectorEnabled && !(await isPaused(pool));

  const queueNames = (names: string[], priority: 0 | 1 | 2, account?: string) => {
    for (const name of names) {
      queue.push({ name, account, priority });
    }
  };

  async function planAccount(account: string, priority: 0 | 1 | 2): Promise<void> {
    const res = await client.account(account);
    await backfillAccount(pool, cfg.currentSeason, account, res.details.map((d) => d.name));
    const last = await getLastIngest(pool, cfg.currentSeason, res.details.map((d) => d.name));
    queueNames(planFromAccount(res.details, last, new Date(), cfg), priority, account);
  }

  const tasks: Array<{ name: string; everyMs: number; run: () => Promise<void> }> = [
    {
      name: 'priority-accounts',
      everyMs: MIN,
      run: async () => {
        for (const account of await listPriorityAccounts(pool)) {
          if (stopping || !(await active())) return;
          try {
            await planAccount(account, 0);
            await markAccountChecked(pool, account, new Date());
            await removePriorityAccount(pool, account);
          } catch (e) {
            errors.add();
            log('error', `priority account ${account} failed`, e);
            // Retryable upstream errors keep the row for the next minute; anything else is dropped.
            if (!(e instanceof UpstreamError && e.retryable)) await removePriorityAccount(pool, account);
          }
        }
      },
    },
    {
      name: 'ladder',
      everyMs: HOUR,
      run: async () => {
        if (!(await active())) return;
        const ladder = await client.ladder();
        const last = await getLastIngest(pool, cfg.currentSeason, ladderNames(ladder));
        queueNames(planFromLadder(ladder, last, new Date(), cfg), 1);
        stats.lastLadderPassAt = new Date().toISOString();
      },
    },
    {
      name: 'online-sweep',
      everyMs: 30 * MIN,
      run: async () => {
        if (!(await active())) return;
        // After a restart the first sweep ignores the 24 h account cooldown; the 20 h
        // freshness check in planFromAccount still prevents re-ingesting fresh characters.
        const due = await accountsDue(pool, await client.online(), new Date(), firstOnlineSweep ? 0 : undefined);
        firstOnlineSweep = false;
        for (const account of due) {
          if (stopping || !(await active())) return;
          try {
            await planAccount(account, 2);
            await markAccountChecked(pool, account, new Date());
          } catch (e) {
            errors.add();
            log('error', `online account ${account} failed`, e);
          }
        }
        stats.lastOnlineSweepAt = new Date().toISOString();
      },
    },
    {
      name: 'season',
      everyMs: DAY,
      run: async () => {
        if (!(await active())) return;
        const s = await client.season();
        stats.seasonName = s.name;
        if (firstSeason === null) firstSeason = s.name;
        else if (firstSeason !== s.name) log('error', `SEASON CHANGED: ${firstSeason} -> ${s.name}`);
      },
    },
    {
      name: 'market-poll',
      everyMs: 75_000,
      run: async () => {
        if (!(await active())) return;
        await pollIncremental(pool, client);
        stats.lastMarketPollAt = new Date().toISOString();
      },
    },
    {
      name: 'market-full-sweep',
      everyMs: 6 * HOUR,
      run: async () => {
        if (!(await active())) return;
        const done = await fullSweep(pool, client, async () => stopping || !(await active()));
        if (done) stats.lastFullMarketSweepAt = new Date().toISOString();
      },
    },
    {
      name: 'heartbeat',
      everyMs: MIN,
      run: async () => {
        const now = Date.now();
        requestSamples.push({ at: now, count: limiter.requestCount });
        while (requestSamples.length > 1 && requestSamples[1].at < now - HOUR) requestSamples.shift();
        stats.requestsTotal = limiter.requestCount;
        stats.requestsLastHour = limiter.requestCount - requestSamples[0].count;
        stats.queueSize = queue.size;
        stats.ingestedLastHour = ingested.count(now);
        stats.errorsLastHour = errors.count(now);
        await heartbeat(pool, stats);
      },
    },
  ];

  const loops = tasks.map(async (t) => {
    while (!stopping) {
      try {
        await t.run();
      } catch (e) {
        errors.add();
        log('error', `${t.name} loop failed`, e);
      }
      const until = Date.now() + t.everyMs;
      while (!stopping && Date.now() < until) await sleep(Math.min(1000, until - Date.now()));
    }
  });

  const consumer = (async () => {
    while (!stopping) {
      try {
        if (!(await active())) {
          await sleep(5000);
          continue;
        }
        const item = queue.shift();
        if (!item) {
          await sleep(1000);
          continue;
        }
        const result = await ingestOne(
          {
            pool,
            client,
            queue,
            cfg,
            onError: (e, it) => {
              errors.add();
              log('error', `ingest ${it.name} failed`, e);
            },
          },
          item,
        );
        if (result === 'ingested') {
          ingested.add();
          stats.lastIngestAt = new Date().toISOString();
        }
      } catch (e) {
        errors.add();
        log('error', 'consumer loop failed', e);
        await sleep(1000);
      }
    }
  })();

  log('info', `collector started (season ${cfg.currentSeason}, enabled=${cfg.collectorEnabled})`);

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log('info', 'stopping');
    await Promise.allSettled([...loops, consumer]);
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
