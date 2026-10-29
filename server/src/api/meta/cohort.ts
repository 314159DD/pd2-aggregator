import type { Pool } from 'pg';
import { getPrices } from '../../db/prices-repo';
import type { CharacterFilter } from '../filters';
import { affixModsBySlot } from './affixes';
import { charmsAggregate } from './charms';
import { levelDistribution, mercSummary, skillFrequency, topItemsBySlot } from './items';
import { withResolvedScope } from './rollup';
import { skillUsage } from './skills';
import { avgStats, coreStats, poolSizes } from './stats';
import type { MetaCohort } from './types';

/** Meta cohorts are defined by mode, season, level, classes and skills only. */
export function metaFilter(f: CharacterFilter): CharacterFilter {
  return { ...f, items: [], mercTypes: [], mercItems: [], maxGearHr: null };
}

/** Queries running at once per pool, shared by all /meta requests so one request cannot exhaust the pool. */
export const META_QUERY_CONCURRENCY = 4;

const limiters = new WeakMap<Pool, Pool>();

/** A pool view whose query() runs at most META_QUERY_CONCURRENCY statements at a time. */
export function limitedPool(pool: Pool, limit = META_QUERY_CONCURRENCY): Pool {
  let view = limiters.get(pool);
  if (view) return view;
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = (): Promise<void> =>
    active < limit
      ? (active++, Promise.resolve())
      : new Promise<void>((resolve) => waiting.push(resolve));
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  view = new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop !== 'query') return Reflect.get(target, prop, receiver);
      return async (...args: unknown[]) => {
        await acquire();
        try {
          return await (target.query as (...a: unknown[]) => Promise<unknown>)(...args);
        } finally {
          release();
        }
      };
    },
  });
  limiters.set(pool, view);
  return view;
}

export async function metaCohort(rawPool: Pool, cohort: CharacterFilter): Promise<MetaCohort> {
  const pool = limitedPool(rawPool);
  // One rollup scope lookup per request, shared by every aggregate below.
  const f = withResolvedScope(pool, cohort);
  const className = f.classes.length === 1 ? f.classes[0] : null;
  const [sizes, core, avg, items, affixes, skillFreq, levels, merc, usage, prices] = await Promise.all([
    poolSizes(pool, f),
    coreStats(pool, f),
    avgStats(pool, f),
    topItemsBySlot(pool, f),
    affixModsBySlot(pool, f),
    skillFrequency(pool, f),
    levelDistribution(pool, f),
    mercSummary(pool, f),
    className ? skillUsage(pool, f, className) : Promise.resolve(null),
    getPrices(pool, f.mode),
  ]);
  const charms = await charmsAggregate(pool, f, sizes.poolSize);
  return {
    season: f.season,
    mode: f.mode,
    className,
    minLevel: f.minLevel,
    skills: f.skills,
    poolSize: sizes.poolSize,
    basePoolSize: sizes.basePoolSize,
    coreStats: core,
    avgStats: avg,
    topItemsBySlot: items,
    affixModsBySlot: affixes,
    charms,
    skillFrequency: skillFreq,
    skillUsage: usage,
    levelDistribution: levels,
    mercenary: merc,
    pricesComputedAt: prices.computedAt,
  };
}
