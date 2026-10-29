import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import type { Pool } from 'pg';
import type { Config } from '../config';
import { addPriorityAccount } from '../db/status-repo';
import { parseFilter } from './filters';
import * as q from './queries';

const VERCEL_PREVIEW_RE = /^https:\/\/pd2-aggregator-[a-z0-9-]+\.vercel\.app$/;
const ACCOUNT_RE = /^[a-zA-Z0-9_-]{1,50}$/;
const QUEUE_LIMIT = 5;
const QUEUE_WINDOW_MS = 60 * 60 * 1000;

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const KEY_PARAMS = [
  'season', 'gameMode', 'minLevel', 'maxLevel', 'classes', 'items', 'skills',
  'mercTypes', 'mercItems', 'page', 'pageSize',
] as const;
const LIST_PARAMS = new Set(['classes', 'items', 'mercTypes', 'mercItems']);

/** Built from known params only, so unknown query noise (`?_=123`) cannot bypass or flood the cache. */
function cacheKey(req: Request): string {
  const params = new URLSearchParams();
  for (const k of KEY_PARAMS) {
    const raw = req.query[k];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string' || v === '') continue;
    params.set(k, LIST_PARAMS.has(k) ? v.split(',').map((x) => x.trim()).filter(Boolean).sort().join(',') : v.trim());
  }
  return `${req.path}?${params.toString()}`;
}

export function createApp(deps: { pool: Pool; cfg: Config }): express.Express {
  const { pool, cfg } = deps;
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes(origin) || VERCEL_PREVIEW_RE.test(origin) ? (origin ?? true) : false),
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '4kb' }));

  const cache = new LRUCache<string, string>({
    maxSize: 80 * 1024 * 1024,
    sizeCalculation: (v) => Buffer.byteLength(v),
    ttl: 15 * 60 * 1000,
  });
  const cached = (compute: (req: Request) => Promise<object>): RequestHandler =>
    wrap(async (req, res) => {
      const key = cacheKey(req);
      let body = cache.get(key);
      if (body === undefined) {
        body = JSON.stringify(await compute(req));
        cache.set(key, body);
      }
      res.type('application/json').send(body);
    });

  const api = express.Router();
  const filterOf = (req: Request) => parseFilter(req.query, cfg);

  api.get(
    '/characters',
    cached((req) => {
      const num = (v: unknown, d: number) => {
        const n = Number(typeof v === 'string' ? v : NaN);
        return Number.isFinite(n) ? Math.trunc(n) : d;
      };
      const page = Math.min(100000, Math.max(1, num(req.query.page, 1)));
      const pageSize = Math.min(50, Math.max(1, num(req.query.pageSize, 50)));
      return q.charactersPage(pool, filterOf(req), page, pageSize);
    }),
  );
  api.get('/characters/stats/item-usage', cached((req) => q.itemUsage(pool, filterOf(req))));
  api.get('/characters/stats/skill-usage', cached((req) => q.skillUsage(pool, filterOf(req))));
  api.get('/characters/stats/merc-type-usage', cached((req) => q.mercTypeUsage(pool, filterOf(req))));
  api.get('/characters/stats/merc-item-usage', cached((req) => q.mercItemUsage(pool, filterOf(req))));
  api.get('/characters/stats/level-distribution', cached((req) => q.levelDistribution(pool, filterOf(req))));
  api.get(
    '/characters/accounts/:account',
    cached((req) => q.charactersByAccount(pool, filterOf(req).season, req.params.account)),
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
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= QUEUE_WINDOW_MS)) hits.delete(k);
      }
      const recent = (hits.get(ip) ?? []).filter((t) => now - t < QUEUE_WINDOW_MS);
      if (recent.length === 0) hits.delete(ip);
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
