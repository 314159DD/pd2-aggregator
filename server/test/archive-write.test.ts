import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import type { CompactCharacter } from '../src/core/compact';
import { upsertCharacter, readRaw } from '../src/db/characters-repo';
import { metaRollupState, rebuildMetaRollup } from '../src/db/meta-rollup';
import { writeArchivePage, markRollupNotReady, type ArchiveRow } from '../src/archive/write';

let pool: Pool;
afterAll(async () => {
  await pool?.end();
});

const row = (c: CompactCharacter): ArchiveRow => ({
  compact: c,
  raw: { character: { name: c.name } },
  lastUpdated: new Date('2026-01-02T03:04:05Z'),
});

const page = (rows: ArchiveRow[], over: Record<string, unknown> = {}) => ({
  season: 13,
  mode: 'softcore' as const,
  pass: 1,
  page: 1,
  upstreamTotal: 100,
  rows,
  counts: { received: rows.length, belowMin: 0, invalid: 0 },
  done: false,
  rollup: true,
  ...over,
});

const snapshot = async () =>
  (await pool.query('select * from meta_rollup order by season, mode, class, level, kind, k1, k2, k3, val')).rows;

const FCR = '+20 to Faster Cast Rate';

const mixed = (): CompactCharacter[] => [
  mkChar({
    name: 'ArA', className: 'Paladin', level: 91, attributes: { strength: 100, vitality: 200 }, life: 1500, mana: 300,
    skills: [['Blessed Hammer', 20], ['Vigor', 1], ['Smite', 5]], merc: 'Defiance',
    items: [
      { quality: 'Unique', name: 'Harlequin Crest', slot: 'Helm', mods: [['item_allskills', 2]] },
      { quality: 'Rare', slot: 'Gloves', mods: [['item_fastercastrate', 20, FCR], ['strength', 15]] },
      { quality: 'Magic', charm: 'Small Charm', mods: [['maxhp', 20], ['res-all', 5]] },
      { quality: 'Magic', charm: 'Large Charm', mods: [['item_addskill_tab', 3, '+3 to Combat Skills (Paladin Only)']] },
      { quality: 'Unique', name: 'Annihilus', charm: 'Small Charm', mods: [['item_allskills', 1]] },
      { quality: 'Unique', owner: 'merc', slot: 'Helm', name: "Andariel's Visage", mods: [['lifesteal', 6]] },
    ],
  }),
  mkChar({ name: 'ArB', className: 'Sorceress', level: 85, attributes: { energy: 90 }, skills: [['Blizzard', 20]], items: [{ quality: 'Set', name: "Tal Rasha's Mask", slot: 'Helm', mods: [['item_allskills', 1]] }] }),
  mkChar({ name: 'ArC', className: 'Paladin', level: 91, skills: [['Blessed Hammer', 20]], items: [{ quality: 'Rare', slot: 'Gloves', mods: [['item_fastercastrate', 20, FCR]] }] }),
  mkChar({ name: 'ArD', className: 'Necromancer', level: 99, mode: 'hardcore', life: 900, items: [{ quality: 'Magic', charm: 'Large Charm', mods: [['maxhp', 40]] }, { quality: 'Rare', slot: 'Helm', mods: [['maxhp', 40, '+40 to Life']] }] }),
  mkChar({ name: 'ArE', className: 'Amazon', level: 80, skills: [['Lightning Fury', 12], ['Lightning Fury', 8]], merc: 'Might', items: [{ quality: 'Runeword', runeword: true, name: 'Grief', slot: 'Right Hand', mods: [['damage', 30]] }] }),
];

beforeEach(async () => {
  await pool?.end();
  pool = await freshDb();
});

describe('writeArchivePage', () => {
  it('writes characters, skills, items, merc and progress', async () => {
    const rows = [
      mkChar({ name: 'A1', skills: [['Vigor', 5]], merc: 'Defiance', items: [{ quality: 'Unique', name: 'X', slot: 'Helm', mods: [['item_allskills', 1]] }] }),
      mkChar({ name: 'A2' }),
      mkChar({ name: 'A3', skills: [['Smite', 3], ['Smite', 7]] }),
    ].map(row);
    const r = await writeArchivePage(pool, page(rows));
    expect(r).toEqual({ inserted: 3, existing: 0 });
    const ch = await pool.query('select * from characters where season = 13 order by name');
    expect(ch.rows.map((x) => x.source)).toEqual(['archive', 'archive', 'archive']);
    expect(ch.rows[0].gear_value_hr).toBeNull();
    expect(ch.rows[0].gear_value_partial).toBe(false);
    expect(ch.rows[0].merc_gear_value_hr).toBeNull();
    expect(new Date(ch.rows[0].last_ingested_at).toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(readRaw(ch.rows[0])).toEqual({ character: { name: 'A1' } });
    expect((await pool.query('select count(*)::int n from character_history')).rows[0].n).toBe(0);
    const sk = await pool.query('select skill, hard_level from character_skills order by character_id, skill');
    expect(sk.rows).toEqual([{ skill: 'Vigor', hard_level: 5 }, { skill: 'Smite', hard_level: 7 }]);
    expect((await pool.query('select count(*)::int n from character_items')).rows[0].n).toBe(1);
    expect((await pool.query('select description from character_merc')).rows).toEqual([{ description: 'Defiance' }]);
    const p = (await pool.query('select * from archive_import_progress')).rows[0];
    expect(p).toMatchObject({ season: 13, mode: 'softcore', pass: 1, next_page: 2, upstream_total: 100, received: 3, inserted: 3, existing: 0, done: false });
  });

  it('is idempotent for a repeated page', async () => {
    const rows = mixed().slice(0, 3).map(row);
    await writeArchivePage(pool, page(rows));
    const before = await snapshot();
    const r = await writeArchivePage(pool, page(rows));
    expect(r).toEqual({ inserted: 0, existing: 3 });
    expect((await pool.query('select count(*)::int n from characters')).rows[0].n).toBe(3);
    expect(await snapshot()).toEqual(before);
    const p = (await pool.query('select * from archive_import_progress')).rows[0];
    expect(p).toMatchObject({ next_page: 2, received: 6, inserted: 3, existing: 3 });
  });

  it('adds counts of later pages and marks done', async () => {
    await writeArchivePage(pool, page([row(mkChar({ name: 'P1' }))]));
    await writeArchivePage(pool, page([row(mkChar({ name: 'P2' }))], { page: 2, counts: { received: 3, belowMin: 1, invalid: 1 }, done: true }));
    const p = (await pool.query('select * from archive_import_progress')).rows[0];
    expect(p).toMatchObject({ next_page: 3, received: 4, inserted: 2, below_min: 1, invalid: 1, done: true });
  });

  it('batch rollup equals a full rebuild', async () => {
    await seed(pool, [mkChar({ name: 'L1', skills: [['Vigor', 20]], items: [{ quality: 'Rare', slot: 'Gloves', mods: [['item_fastercastrate', 20, FCR]] }] }), mkChar({ name: 'L2', className: 'Druid' })]);
    const all = mixed();
    await writeArchivePage(pool, page(all.slice(0, 3).map(row)));
    await writeArchivePage(pool, page(all.slice(3).map(row), { mode: 'hardcore', page: 1 }));
    expect((await pool.query('select count(*)::int n from characters')).rows[0].n).toBe(7);
    expect(await metaRollupState(pool)).toBe('ok');
    const before = await snapshot();
    expect(before.length).toBeGreaterThan(0);
    await rebuildMetaRollup(pool);
    expect(await snapshot()).toEqual(before);
    expect(await metaRollupState(pool)).toBe('ok');
  });

  it('skips the rollup with rollup false', async () => {
    await writeArchivePage(pool, page(mixed().map(row), { rollup: false }));
    expect((await pool.query('select count(*)::int n from characters where season = 13')).rows[0].n).toBe(5);
    expect((await pool.query('select count(*)::int n from meta_rollup where season = 13')).rows[0].n).toBe(0);
  });

  it('records progress for an empty page', async () => {
    const r = await writeArchivePage(pool, page([], { done: true }));
    expect(r).toEqual({ inserted: 0, existing: 0 });
    expect((await pool.query('select done from archive_import_progress')).rows[0].done).toBe(true);
  });

  it('rolls everything back when a row fails', async () => {
    const bad = mkChar({ name: 'Bad', items: [{ quality: 'Unique', slot: 'Helm', mods: [['item_allskills', 1]] }] });
    bad.items[0].name = null as unknown as string;
    await expect(writeArchivePage(pool, page([row(mkChar({ name: 'Good' })), row(bad)]))).rejects.toThrow();
    expect((await pool.query('select count(*)::int n from characters where season = 13')).rows[0].n).toBe(0);
    expect((await pool.query('select count(*)::int n from archive_import_progress')).rows[0].n).toBe(0);
    expect((await pool.query('select count(*)::int n from meta_rollup')).rows[0].n).toBe(0);
  });

  it('runs concurrently with a live upsert and keeps the rollup exact', async () => {
    await seed(pool, [mkChar({ name: 'Live0' })]);
    const live = mkChar({ name: 'Live1', skills: [['Vigor', 20]], items: [{ quality: 'Rare', slot: 'Gloves', mods: [['item_fastercastrate', 20, FCR]] }] });
    await Promise.all([
      writeArchivePage(pool, page(mixed().map(row))),
      upsertCharacter(pool, 14, live, { character: { name: 'Live1' } }),
      upsertCharacter(pool, 14, { ...live, level: 95 }, { character: { name: 'Live1' } }),
    ]);
    const before = await snapshot();
    await rebuildMetaRollup(pool);
    expect(await snapshot()).toEqual(before);
    expect(await metaRollupState(pool)).toBe('ok');
  });
});

describe('markRollupNotReady', () => {
  it('flips ready off', async () => {
    await markRollupNotReady(pool);
    expect(await metaRollupState(pool)).toBe('not-ready');
  });
});
