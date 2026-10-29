import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { skillUsage } from '../src/api/meta/skills';

let pool: Pool;
beforeEach(async () => {
  pool = await freshDb();
});
afterEach(async () => {
  await pool.end();
});

const F: CharacterFilter = {
  season: 14, mode: 'softcore', minLevel: 1, maxLevel: 99, classes: ['Amazon'], items: [], skills: [],
  mercTypes: [], mercItems: [], maxGearHr: null,
};
const amazon = (name: string, skills: Array<[string, number]>) => mkChar({ name, className: 'Amazon', skills });
const by = (rows: Awaited<ReturnType<typeof skillUsage>>, name: string) => rows!.find((r) => r.name === name);

describe('skillUsage (Lightning Strike cohort)', () => {
  const sk: Array<[string, number]> = [
    ['Jab', 1], ['Power Strike', 1], ['Charged Strike', 20], ['Lightning Strike', 20], ['Decoy', 1], ['Valkyrie', 1],
  ];
  beforeEach(async () => {
    await seed(pool, [amazon('A', sk), amazon('B', sk), amazon('C', sk)]);
  });

  it('classifies Power Strike (1pt) as prereq, not build', async () => {
    const row = by(await skillUsage(pool, F, 'Amazon'), 'Power Strike')!;
    expect(row).toMatchObject({ numAsPrereq: 3, numAsBuild: 0, pctBuild: 0 });
  });
  it('classifies Jab as prereq because Power Strike and Charged Strike are invested', async () => {
    const row = by(await skillUsage(pool, F, 'Amazon'), 'Jab')!;
    expect(row).toMatchObject({ numAsPrereq: 3, numAsBuild: 0 });
  });
  it('keeps Charged Strike and Lightning Strike in the build', async () => {
    const out = await skillUsage(pool, F, 'Amazon');
    expect(by(out, 'Charged Strike')).toMatchObject({ numAsBuild: 3, numAsPrereq: 0, pctBuild: 1, numAtTwenty: 3, totalSample: 3 });
    expect(by(out, 'Lightning Strike')).toMatchObject({ numAsBuild: 3, numAsPrereq: 0 });
  });
  it('keeps Decoy (1pt, nothing requires it) in the build', async () => {
    expect(by(await skillUsage(pool, F, 'Amazon'), 'Decoy')).toMatchObject({ numAsBuild: 3, numAsPrereq: 0 });
  });
  it('sorts by pctBuild desc and caps at topN', async () => {
    const out = (await skillUsage(pool, F, 'Amazon'))!;
    for (let i = 1; i < out.length; i++) expect(out[i - 1].pctBuild).toBeGreaterThanOrEqual(out[i].pctBuild);
    expect(await skillUsage(pool, F, 'Amazon', 2)).toHaveLength(2);
  });
});

describe('skillUsage edge cases', () => {
  it('Power Strike 5 is build; Power Strike 1 + Lightning Strike 20 is prereq', async () => {
    await seed(pool, [
      amazon('A', [['Power Strike', 5], ['Lightning Strike', 20]]),
      amazon('B', [['Power Strike', 1], ['Lightning Strike', 20]]),
    ]);
    expect(by(await skillUsage(pool, F, 'Amazon'), 'Power Strike')).toMatchObject({ numAsBuild: 1, numAsPrereq: 1, numWithAny: 2 });
  });
  it('a 1pt skill with nothing downstream is build', async () => {
    await seed(pool, [amazon('A', [['Jab', 1]])]);
    expect(by(await skillUsage(pool, F, 'Amazon'), 'Jab')).toMatchObject({ numAsBuild: 1, numAsPrereq: 0 });
  });
  it('flags Jab when Power Strike is invested', async () => {
    await seed(pool, [amazon('A', [['Jab', 1], ['Power Strike', 20]])]);
    expect(by(await skillUsage(pool, F, 'Amazon'), 'Jab')).toMatchObject({ numAsPrereq: 1, numAsBuild: 0 });
  });
  it('returns null for an unknown class', async () => {
    await seed(pool, [amazon('A', [['Jab', 1]])]);
    expect(await skillUsage(pool, F, 'NotAClass')).toBeNull();
  });
  it('returns [] for an empty pool', async () => {
    expect(await skillUsage(pool, F, 'Amazon')).toEqual([]);
  });
  it('treats a skill missing from the prereq map as build', async () => {
    await seed(pool, [amazon('A', [['Made Up Skill', 5], ['Jab', 1]])]);
    expect(by(await skillUsage(pool, F, 'Amazon'), 'Made Up Skill')).toMatchObject({ numAsBuild: 1, numAsPrereq: 0 });
  });
  it('avgBaseLevelAsBuild excludes prereq rows', async () => {
    await seed(pool, [
      amazon('A', [['Power Strike', 1], ['Lightning Strike', 20]]),
      amazon('B', [['Power Strike', 20], ['Lightning Strike', 20]]),
    ]);
    const row = by(await skillUsage(pool, F, 'Amazon'), 'Power Strike')!;
    expect(row.avgBaseLevel).toBeCloseTo(10.5);
    expect(row.avgBaseLevelAsBuild).toBe(20);
  });
  it('ignores skills at hard_level 0 and assigns roles', async () => {
    await seed(pool, [amazon('A', [['Inner Sight', 5], ['Jab', 0]])]);
    const out = await skillUsage(pool, F, 'Amazon');
    expect(by(out, 'Jab')).toBeUndefined();
    expect(by(out, 'Inner Sight')!.role).toBe('synergy');
  });
});
