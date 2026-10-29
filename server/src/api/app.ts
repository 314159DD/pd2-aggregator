import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import type { Pool } from 'pg';
import type { Config } from '../config';
import { addPriorityAccount } from '../db/status-repo';
import { parseFilter, type CharacterFilter } from './filters';
import { getPrices } from '../db/prices-repo';
import * as bq from './builds-queries';
import { buildsCharacters, characterPreview } from './builds-characters';
import { characterDetail, characterHistory } from './character-detail';
import * as q from './queries';
import * as meta from './meta/cohort';
import { metaFilter } from './meta/cohort';
import type { MetaCohort } from './meta/types';
import { diffCharacter, findDiffCharacter, loadDiffUser } from './meta/diff';

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
  'mercTypes', 'mercItems', 'maxGearHr', 'page', 'pageSize', 'sort', 'dir',
] as const;
const LIST_PARAMS = new Set(['classes', 'items', 'mercTypes', 'mercItems']);

/** Built from known params only, so unknown query noise (`?_=123`) cannot bypass or flood the cache. */
export function cacheKeyFrom(path: string, query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const k of KEY_PARAMS) {
    const raw = query[k];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string' || v === '') continue;
    params.set(k, LIST_PARAMS.has(k) ? v.split(',').map((x) => x.trim()).filter(Boolean).sort().join(',') : v.trim());
  }
  return `${path}?${params.toString()}`;
}

/** Key of a Meta cohort from the normalised filter fields metaFilter keeps, so defaults and absent params collide and unrelated params do not. */
export function metaCacheKey(path: string, f: CharacterFilter): string {
  const skills = f.skills.map((x) => JSON.stringify([x.name, x.minLevel])).sort();
  return `${path}?${JSON.stringify([f.season, f.mode, f.minLevel, f.maxLevel, [...f.classes].sort(), skills])}`;
}

const cacheKey = (req: Request): string => cacheKeyFrom(req.path, req.query);

const WARM_MIN_LEVEL = 80;

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

  /** JSON of a Meta cohort, cached under its normalised key. */
  const metaBody = async (f: CharacterFilter): Promise<string> => {
    const key = metaCacheKey('/meta', f);
    let body = cache.get(key);
    if (body === undefined) {
      body = JSON.stringify(await meta.metaCohort(pool, f));
      cache.set(key, body);
    }
    return body;
  };

  api.get(
    '/meta',
    wrap(async (req, res) => {
      res.type('application/json').send(await metaBody(metaFilter(filterOf(req))));
    }),
  );

  api.get(
    '/meta/diff',
    wrap(async (req, res) => {
      const raw = req.query.char;
      const char = (Array.isArray(raw) ? raw[0] : raw);
      const name = typeof char === 'string' ? char.trim() : '';
      const notFound = () => res.status(404).json({ error: { message: 'Character not found' } });
      if (!name) return void notFound();
      const f = metaFilter(filterOf(req));
      const key = `${metaCacheKey('/meta/diff', f)}|${name.toLowerCase()}`;
      let body = cache.get(key);
      if (body === undefined) {
        const found = await findDiffCharacter(pool, f.season, f.mode, name);
        const user = found ? await loadDiffUser(pool, found.id) : null;
        if (!user) return void notFound();
        // Compare against the cohort of the mode the character was found in, not the requested one.
        const cohort = JSON.parse(await metaBody({ ...f, mode: found!.mode })) as MetaCohort;
        body = JSON.stringify({
          diff: diffCharacter(user, {
            topItemsBySlot: cohort.topItemsBySlot,
            affixModsBySlot: cohort.affixModsBySlot,
            poolMercType: cohort.mercenary.topType || null,
          }),
        });
        cache.set(key, body);
      }
      res.type('application/json').send(body);
    }),
  );

  /** Computes the Meta cohort of every mode x (all classes + each class) one at a time and stores it under the key a real request has. */
  app.locals.warmMeta = async (): Promise<number> => {
    let n = 0;
    for (const gameMode of ['softcore', 'hardcore']) {
      for (const classes of ['', ...q.CLASSES]) {
        const query: Record<string, string> = { gameMode, minLevel: String(WARM_MIN_LEVEL) };
        if (classes) query.classes = classes;
        const f = metaFilter(parseFilter(query, cfg));
        cache.set(metaCacheKey('/meta', f), JSON.stringify(await meta.metaCohort(pool, f)));
        n++;
      }
    }
    return n;
  };

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

  const byName = (
    fn: (season: number, mode: 'softcore' | 'hardcore', name: string) => Promise<object | null>,
  ): RequestHandler =>
    wrap(async (req, res) => {
      const f = filterOf(req);
      const key = `${cacheKey(req)}|${req.params.name.toLowerCase()}`;
      let body = cache.get(key);
      if (body === undefined) {
        const result = await fn(f.season, f.mode, req.params.name);
        if (!result) {
          res.status(404).json({ error: { message: 'Character not found' } });
          return;
        }
        body = JSON.stringify(result);
        cache.set(key, body);
      }
      res.type('application/json').send(body);
    });
  // Registered after /characters/stats/* and /characters/accounts/:account.
  api.get('/characters/:name', byName((s, m, n) => characterDetail(pool, s, m, n, s === cfg.currentSeason)));
  api.get('/characters/:name/history', byName((s, m, n) => characterHistory(pool, s, m, n)));

  api.get('/builds/usage', cached((req) => bq.buildsUsage(pool, filterOf(req))));
  api.get('/builds/seasons', cached(() => bq.seasons(pool, cfg)));
  api.get(
    '/builds/characters',
    cached((req) => {
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      return buildsCharacters(pool, filterOf(req), {
        sort: str(req.query.sort),
        dir: str(req.query.dir),
        page: Number(str(req.query.page) || 1),
      });
    }),
  );
  api.get(
    '/builds/characters/:name',
    wrap(async (req, res) => {
      const f = filterOf(req);
      const key = `${cacheKey(req)}|${req.params.name.toLowerCase()}`;
      let body = cache.get(key);
      if (body === undefined) {
        const preview = await characterPreview(pool, f.season, f.mode, req.params.name, f.season === cfg.currentSeason);
        if (!preview) {
          res.status(404).json({ error: { message: 'Character not found' } });
          return;
        }
        body = JSON.stringify(preview);
        cache.set(key, body);
      }
      res.type('application/json').send(body);
    }),
  );
  api.get('/builds/history', cached((req) => bq.buildShareHistory(pool, filterOf(req).season, filterOf(req).mode)));
  api.get('/prices', cached((req) => getPrices(pool, filterOf(req).mode)));

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
