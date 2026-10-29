import { gunzipSync, gzipSync } from 'node:zlib';
import type { Pool, PoolClient } from 'pg';
import type { CompactCharacter, CompactItem } from '../core/compact';
import { lockMetaRollup, withMetaRollup } from './meta-rollup';
import { recomputeGearValues } from './prices-repo';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Replaces all items of a character: delete, then one unnest insert. */
export async function replaceItems(client: PoolClient, characterId: number, items: CompactItem[]): Promise<void> {
  await client.query('delete from character_items where character_id = $1', [characterId]);
  if (!items.length) return;
  const it = items;
  await client.query(
    `insert into character_items
       (character_id, owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, inv_code, mods)
     select $1, owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, inv_code, mods::jsonb
     from unnest($2::text[], $3::text[], $4::boolean[], $5::boolean[], $6::text[], $7::text[], $8::text[], $9::text[], $10::boolean[], $11::text[], $12::text[])
       as t(owner, slot, is_switch, is_charm, name, quality, base_name, base_type, is_runeword, inv_code, mods)`,
    [characterId, it.map((i) => i.owner), it.map((i) => i.slot), it.map((i) => i.isSwitch), it.map((i) => i.isCharm),
      it.map((i) => i.name), it.map((i) => i.quality), it.map((i) => i.baseName), it.map((i) => i.baseType),
      it.map((i) => i.isRuneword), it.map((i) => i.invCode), it.map((i) => JSON.stringify(i.mods))],
  );
}

export async function upsertCharacter(
  pool: Pool,
  season: number,
  c: CompactCharacter,
  enrichedRaw: object,
  now: Date = new Date(),
): Promise<{ id: number; historyWritten: boolean }> {
  const raw = gzipSync(JSON.stringify(enrichedRaw));
  const skillMap = new Map<string, { skill: string; hardLevel: number; realLevel: number | null }>();
  for (const sk of c.skills) {
    const prev = skillMap.get(sk.skill);
    if (!prev || sk.hardLevel > prev.hardLevel) skillMap.set(sk.skill, sk);
  }
  const skills = [...skillMap.values()];
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('begin');
    // Rollup lock first, then everything else: the previous row is read under it.
    await lockMetaRollup(client);
    const prev = await client.query('select id from characters where season = $1 and mode = $2 and name = $3', [
      season,
      c.mode,
      c.name,
    ]);
    let isNew = false;
    const id = await withMetaRollup(client, prev.rows.length ? Number(prev.rows[0].id) : null, async () => {
      const up = await client.query(
        `insert into characters
           (season, mode, name, account, class, level, experience, life, mana, attributes, guild, is_dead, raw, last_ingested_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (season, mode, name) do update set
           account = coalesce(excluded.account, characters.account), class = excluded.class, level = excluded.level,
           experience = excluded.experience, life = excluded.life, mana = excluded.mana,
           attributes = excluded.attributes, guild = excluded.guild, is_dead = excluded.is_dead,
           raw = excluded.raw, last_ingested_at = excluded.last_ingested_at
         returning id, (xmax = 0) as inserted`,
        [season, c.mode, c.name, c.account, c.className, c.level, c.experience, c.life, c.mana,
          JSON.stringify(c.attributes), c.guild, c.isDead, raw, now],
      );
      const id = Number(up.rows[0].id);
      isNew = up.rows[0].inserted;

      await client.query('delete from character_skills where character_id = $1', [id]);
      await client.query('delete from character_merc where character_id = $1', [id]);

      if (skills.length) {
        await client.query(
          `insert into character_skills (character_id, skill, hard_level, real_level)
           select $1, * from unnest($2::text[], $3::int[], $4::int[])`,
          [id, skills.map((s) => s.skill), skills.map((s) => s.hardLevel), skills.map((s) => s.realLevel)],
        );
      }
      await replaceItems(client, id, c.items);
      await recomputeGearValues(client, { characterIds: [id] });
      if (c.mercDescription !== null) {
        await client.query('insert into character_merc (character_id, description) values ($1, $2)', [id, c.mercDescription]);
      }
      return id;
    });

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
    try {
      await client.query('rollback');
    } catch {
      destroy = true;
    }
    throw e;
  } finally {
    client.release(destroy);
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

/** Like readRaw, but fills an empty accountName from the stored account column. */
export function readRawWithAccount(row: { raw: Buffer; account?: string | null }): unknown {
  const raw = readRaw(row) as Record<string, unknown> | null;
  if (raw && typeof raw === 'object' && !raw.accountName && row.account) raw.accountName = row.account;
  return raw;
}

/** Sets the account on already-stored characters that do not have one yet. */
export async function backfillAccount(pool: Pool, season: number, account: string, names: string[]): Promise<number> {
  if (!names.length) return 0;
  const r = await pool.query(
    `update characters set account = $1
     where season = $2 and lower(name) = any($3::text[]) and account is null`,
    [account, season, names.map((n) => n.toLowerCase())],
  );
  return r.rowCount ?? 0;
}
