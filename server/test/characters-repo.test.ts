import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { toCompact, enrichRaw } from '../src/core/compact';
import { upsertCharacter, getLastIngest, readRaw } from '../src/db/characters-repo';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;
let pool: Pool;
beforeEach(async () => { pool = await freshDb(); });
afterEach(async () => { await pool.end(); });

describe('characters repo', () => {
  it('upserts, dedupes history, and round-trips raw', async () => {
    const t0 = new Date('2026-10-29T10:00:00Z');
    const t1 = new Date(t0.getTime() + 3600_000);
    const t2 = new Date(t0.getTime() + 2 * 3600_000);
    const c = toCompact(fx, 'MC-MEEKS');

    const a = await upsertCharacter(pool, 14, c, enrichRaw(fx, 'MC-MEEKS'), t0);
    const b = await upsertCharacter(pool, 14, c, enrichRaw(fx, 'MC-MEEKS'), t1);
    expect(a.historyWritten).toBe(true);
    expect(b.historyWritten).toBe(false);
    expect(b.id).toBe(a.id);
    expect((await pool.query('select count(*)::int n from characters')).rows[0].n).toBe(1);
    expect((await pool.query('select count(*)::int n from character_items')).rows[0].n).toBe(c.items.length);
    expect((await pool.query('select count(*)::int n from character_skills')).rows[0].n).toBe(c.skills.length);

    const fx2 = structuredClone(fx);
    fx2.character.experience += 1;
    const c2 = toCompact(fx2, 'MC-MEEKS');
    const d = await upsertCharacter(pool, 14, c2, enrichRaw(fx2, 'MC-MEEKS'), t2);
    expect(d.historyWritten).toBe(true);
    expect((await pool.query('select count(*)::int n from character_history')).rows[0].n).toBe(2);

    const row = (await pool.query('select raw from characters where id = $1', [a.id])).rows[0];
    const raw = readRaw(row) as any;
    expect(raw.accountName).toBe('MC-MEEKS');
    expect(Array.isArray(raw.realSkills)).toBe(true);

    const m = await getLastIngest(pool, 14, [c.name.toLowerCase(), 'nobody']);
    expect([...m.keys()]).toEqual([c.name.toLowerCase()]);
    expect(m.get(c.name.toLowerCase())!.experience).toBe(c2.experience);
  });

  it('writes history again after 24h', async () => {
    const c = toCompact(fx, 'MC-MEEKS');
    await upsertCharacter(pool, 14, c, {}, new Date('2026-10-29T10:00:00Z'));
    const r = await upsertCharacter(pool, 14, c, {}, new Date('2026-10-31T10:00:00Z'));
    expect(r.historyWritten).toBe(true); // same experience as last row, but older than 24h
  });

  it('replaces children on re-upsert', async () => {
    const c = toCompact(fx, 'MC-MEEKS');
    expect(c.items.length).toBeGreaterThan(1);
    expect(c.skills.length).toBeGreaterThan(1);
    const a = await upsertCharacter(pool, 14, { ...c, mercDescription: 'Merc' }, {}, new Date('2026-10-29T10:00:00Z'));
    expect((await pool.query('select count(*)::int n from character_merc')).rows[0].n).toBe(1);
    const smaller = { ...c, items: c.items.slice(0, 1), skills: c.skills.slice(0, 1), mercDescription: null };
    const b = await upsertCharacter(pool, 14, smaller, {}, new Date('2026-10-29T11:00:00Z'));
    expect(b.id).toBe(a.id);
    expect((await pool.query('select count(*)::int n from character_items')).rows[0].n).toBe(1);
    expect((await pool.query('select count(*)::int n from character_skills')).rows[0].n).toBe(1);
    expect((await pool.query('select count(*)::int n from character_merc')).rows[0].n).toBe(0);
  });

  it('dedupes duplicate skills keeping the highest hardLevel', async () => {
    const c = toCompact(fx, 'MC-MEEKS');
    const s = c.skills[0];
    const dup = { ...c, skills: [{ ...s, hardLevel: 3 }, { ...s, hardLevel: 9 }, { ...s, hardLevel: 5 }] };
    const r = await upsertCharacter(pool, 14, dup, {}, new Date('2026-10-29T10:00:00Z'));
    const rows = (await pool.query('select hard_level from character_skills where character_id = $1', [r.id])).rows;
    expect(rows).toEqual([{ hard_level: 9 }]);
  });
});
