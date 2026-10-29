import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import type { Pool } from 'pg';
import type { Config } from '../config';
import { addPriorityAccount } from '../db/status-repo';
import { parseFilter } from './filters';
import * as q from './queries';

const ACCOUNT_RE = /^[a-zA-Z0-9_-]{1,50}$/;
const QUEUE_LIMIT = 5;
const QUEUE_WINDOW_MS = 60 * 60 * 1000;

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function cacheKey(req: Request): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query).sort(([a], [b]) => a.localeCompare(b))) {
    for (const x of Array.isArray(v) ? v : [v]) params.append(k, String(x));
  }
  return `${req.path}?${params.toString()}`;
}

export function createApp(deps: { pool: Pool; cfg: Config }): express.Express {
  const { pool, cfg } = deps;
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: cfg.corsOrigins }));
  app.use(compression());
  app.use(express.json({ limit: '4kb' }));

  const cache = new LRUCache<string, object>({ max: 500, ttl: 15 * 60 * 1000 });
  const cached = (compute: (req: Request) => Promise<object>): RequestHandler =>
    wrap(async (req, res) => {
      const key = cacheKey(req);
      let body = cache.get(key);
      if (body === undefined) {
        body = await compute(req);
        cache.set(key, body);
      }
      res.json(body);
    });

  const api = express.Router();
  const filterOf = (req: Request) => parseFilter(req.query, cfg);

  api.get(
    '/characters',
    wrap(async (req, res) => {
      const num = (v: unknown, d: number) => {
        const n = Number(typeof v === 'string' ? v : NaN);
        return Number.isFinite(n) ? Math.trunc(n) : d;
      };
      const page = Math.max(1, num(req.query.page, 1));
      const pageSize = Math.min(50, Math.max(1, num(req.query.pageSize, 50)));
      res.json(await q.charactersPage(pool, filterOf(req), page, pageSize));
    }),
  );
  api.get('/characters/stats/item-usage', cached((req) => q.itemUsage(pool, filterOf(req))));
  api.get('/characters/stats/skill-usage', cached((req) => q.skillUsage(pool, filterOf(req))));
  api.get('/characters/stats/merc-type-usage', cached((req) => q.mercTypeUsage(pool, filterOf(req))));
  api.get('/characters/stats/merc-item-usage', cached((req) => q.mercItemUsage(pool, filterOf(req))));
  api.get('/characters/stats/level-distribution', cached((req) => q.levelDistribution(pool, filterOf(req))));
  api.get(
    '/characters/accounts/:account',
    wrap(async (req, res) => {
      res.json(await q.charactersByAccount(pool, filterOf(req).season, req.params.account));
    }),
  );

  const hits = new Map<string, number[]>();
  api.post(
    '/accounts/queue',
    wrap(async (req, res) => {
      const name = (req.body as { accountName?: unknown } | undefined)?.accountName;
      if (typeof name !== 'string' || !ACCOUNT_RE.test(name)) {
        res.status(400).json({ error: 'Invalid accountName' });
        return;
      }
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      const recent = (hits.get(ip) ?? []).filter((t) => now - t < QUEUE_WINDOW_MS);
      if (recent.length >= QUEUE_LIMIT) {
        hits.set(ip, recent);
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      recent.push(now);
      hits.set(ip, recent);
      await addPriorityAccount(pool, name, req.ip ?? null);
      res.json({ queued: true });
    }),
  );

  api.get(
    '/health',
    wrap(async (_req, res) => {
      try {
        await q.health(pool);
        res.json({ status: 'ok' });
      } catch {
        res.status(503).json({ status: 'error' });
      }
    }),
  );
  api.get(
    '/stats',
    wrap(async (_req, res) => {
      res.json(await q.siteStats(pool, cfg.currentSeason));
    }),
  );

  app.use('/api/v1', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`${new Date().toISOString()} ERROR api`, err);
    res.status(500).json({ error: 'Internal error' });
  });
  return app;
}
