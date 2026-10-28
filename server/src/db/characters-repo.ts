import { gunzipSync, gzipSync } from 'node:zlib';
import type { Pool } from 'pg';
import type { CompactCharacter } from '../core/compact';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function upsertCharacter(
  pool: Pool,
  season: number,
  c: CompactCharacter,
  enrichedRaw: object,
  now: Date = new Date(),
): Promise<{ id: number; historyWritten: boolean }> {
  const raw = gzipSync(JSON.stringify(enrichedRaw));
  const client = await pool.connect();
  try {
    await client.query('begin');
    const up = await client.query(
      `insert into characters
         (season, mode, name, account, class, level, experience, life, mana, attributes, guild, is_dead, raw, last_ingested_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (season, mode, name) do update set
         account = excluded.account, class = excluded.class, level = excluded.level,
         experience = excluded.experience, life = excluded.life, mana = excluded.mana,
         attributes = excluded.attributes, guild = excluded.guild, is_dead = excluded.is_dead,
         raw = excluded.raw, last_ingested_at = excluded.last_ingested_at
       returning id, (xmax = 0) as inserted`,
      [season, c.mode, c.name, c.account, c.className, c.level, c.experience, c.life, c.mana,
        JSON.stringify(c.attributes), c.guild, c.isDead, raw, now],
    );
    const id = Number(up.rows[0].id);
    const isNew: boolean = up.rows[0].inserted;

    await client.query('delete from character_skills where character_id = $1', [id]);
    await client.query('delete from character_items where character_id = $1', [id]);
    await client.query('delete from character_merc where character_id = $1', [id]);

    if (c.skills.length) {
      await client.query(
        `insert into character_skills (character_id, skill, hard_level, real_level)
         select $1, * from unnest($2::text[], $3::int[], $4::int[])`,
        [id, c.skills.map((s) => s.skill), c.skills.map((s) => s.hardLevel), c.skills.map((s) => s.realLevel)],
      );
    }
    if (c.items.length) {
      const it = c.items;
      await client.query(
        `insert into character_items
           (character_id, owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, mods)
         select $1, owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, mods::jsonb
         from unnest($2::text[], $3::text[], $4::boolean[], $5::boolean[], $6::text[], $7::text[], $8::text[], $9::text[], $10::boolean[], $11::text[])
           as t(owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, mods)`,
        [id, it.map((i) => i.owner), it.map((i) => i.slot), it.map((i) => i.isSwitch), it.map((i) => i.isCharm),
          it.map((i) => i.name), it.map((i) => i.quality), it.map((i) => i.baseName), it.map((i) => i.baseType),
          it.map((i) => i.isRuneword), it.map((i) => JSON.stringify(i.mods))],
      );
    }
    if (c.mercDescription !== null) {
      await client.query('insert into character_merc (character_id, description) values ($1, $2)', [id, c.mercDescription]);
    }

    let historyWritten = isNew;
    if (!historyWritten) {
      const h = await client.query(
        'select ts, experience from character_history where character_id = $1 order by ts desc limit 1',
        [id],
      );
      const last = h.rows[0];
      historyWritten =
        !last || Number(last.experience) !== c.experience || now.getTime() - new Date(last.ts).getTime() > DAY_MS;
    }
    if (historyWritten) {
      await client.query(
        'insert into character_history (character_id, ts, level, experience) values ($1,$2,$3,$4) on conflict do nothing',
        [id, now, c.level, c.experience],
      );
    }
    await client.query('commit');
    return { id, historyWritten };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function getLastIngest(
  pool: Pool,
  season: number,
  names: string[],
): Promise<Map<string, { lastIngestedAt: Date; experience: number }>> {
  const out = new Map<string, { lastIngestedAt: Date; experience: number }>();
  if (!names.length) return out;
  const r = await pool.query(
    `select name, last_ingested_at, experience from characters
     where season = $1 and lower(name) = any($2::text[])`,
    [season, names.map((n) => n.toLowerCase())],
  );
  for (const row of r.rows) {
    out.set(String(row.name).toLowerCase(), { lastIngestedAt: row.last_ingested_at, experience: Number(row.experience) });
  }
  return out;
}

export function readRaw(row: { raw: Buffer }): unknown {
  return JSON.parse(gunzipSync(row.raw).toString('utf8'));
}
