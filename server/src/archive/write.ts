import { gzipSync } from 'node:zlib';
import type { Pool, PoolClient } from 'pg';
import type { CompactCharacter } from '../core/compact';
import { dedupeSkills, replaceItems } from '../db/characters-repo';
import { addMetaRollupFacts, lockMetaRollup } from '../db/meta-rollup';

export type ArchiveRow = { compact: CompactCharacter; raw: object; lastUpdated: Date };
export type PageCounts = { received: number; inserted: number; existing: number; belowMin: number; invalid: number };

export type ArchivePage = {
  season: number;
  mode: 'softcore' | 'hardcore';
  pass: number;
  page: number;
  upstreamTotal: number;
  rows: ArchiveRow[];
  counts: Omit<PageCounts, 'inserted' | 'existing'>;
  done: boolean;
  rollup: boolean;
};

/**
 * Writes one upstream page and its progress row in a single transaction. Existing characters are
 * never touched (on conflict do nothing); only the newly inserted ones get skills, items, merc rows
 * and rollup facts. The rollup lock is taken first, like upsertCharacter, and held for this page only.
 */
export async function writeArchivePage(pool: Pool, p: ArchivePage): Promise<{ inserted: number; existing: number }> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('begin');
    await lockMetaRollup(client);
    const rows = p.rows;
    let inserted = 0;
    if (rows.length) {
      const ins = await client.query(
        `insert into characters
           (season, mode, name, account, class, level, experience, life, mana, attributes, guild, is_dead, source, raw, last_ingested_at)
         select $1, $2, t.name, t.account, t.class, t.level, t.experience, t.life, t.mana, t.attributes::jsonb, t.guild, t.is_dead,
                'archive', t.raw, t.ingested
         from unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::bigint[], $8::int[], $9::int[], $10::text[], $11::text[],
                     $12::boolean[], $13::bytea[], $14::timestamptz[])
           as t(name, account, class, level, experience, life, mana, attributes, guild, is_dead, raw, ingested)
         on conflict (season, mode, name) do nothing
         returning id, name`,
        [
          p.season, p.mode,
          rows.map((r) => r.compact.name), rows.map((r) => r.compact.account), rows.map((r) => r.compact.className),
          rows.map((r) => r.compact.level), rows.map((r) => r.compact.experience), rows.map((r) => r.compact.life),
          rows.map((r) => r.compact.mana), rows.map((r) => JSON.stringify(r.compact.attributes)),
          rows.map((r) => r.compact.guild), rows.map((r) => r.compact.isDead),
          rows.map((r) => gzipSync(JSON.stringify(r.raw))), rows.map((r) => r.lastUpdated),
        ],
      );
      // First row wins when a page repeats a name, as the insert does.
      const byName = new Map<string, ArchiveRow>();
      for (const r of rows) if (!byName.has(r.compact.name)) byName.set(r.compact.name, r);
      const created = ins.rows.map((x) => ({ id: Number(x.id), row: byName.get(x.name as string)! }));
      await writeChildren(client, created);
      if (p.rollup) await addMetaRollupFacts(client, created.map((c) => c.id));
      inserted = created.length;
    }
    const existing = rows.length - inserted;
    await client.query(
      `insert into archive_import_progress
         (season, mode, pass, next_page, upstream_total, received, inserted, existing, below_min, invalid, done, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (season, mode, pass) do update set
         next_page = excluded.next_page, upstream_total = excluded.upstream_total,
         received = archive_import_progress.received + excluded.received,
         inserted = archive_import_progress.inserted + excluded.inserted,
         existing = archive_import_progress.existing + excluded.existing,
         below_min = archive_import_progress.below_min + excluded.below_min,
         invalid = archive_import_progress.invalid + excluded.invalid,
         done = excluded.done, updated_at = now()`,
      [p.season, p.mode, p.pass, p.page + 1, p.upstreamTotal, p.counts.received, inserted, existing,
        p.counts.belowMin, p.counts.invalid, p.done],
    );
    await client.query('commit');
    return { inserted, existing };
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

async function writeChildren(
  client: PoolClient,
  created: Array<{ id: number; row: ArchiveRow }>,
): Promise<void> {
  if (!created.length) return;
  const sk = created.flatMap(({ id, row }) => dedupeSkills(row.compact).map((s) => ({ id, ...s })));
  if (sk.length) {
    await client.query(
      `insert into character_skills (character_id, skill, hard_level, real_level)
       select * from unnest($1::bigint[], $2::text[], $3::int[], $4::int[])`,
      [sk.map((s) => s.id), sk.map((s) => s.skill), sk.map((s) => s.hardLevel), sk.map((s) => s.realLevel)],
    );
  }
  for (const { id, row } of created) await replaceItems(client, id, row.compact.items);
  const mercs = created.filter((c) => c.row.compact.mercDescription !== null);
  if (mercs.length) {
    await client.query(
      'insert into character_merc (character_id, description) select * from unnest($1::bigint[], $2::text[])',
      [mercs.map((c) => c.id), mercs.map((c) => c.row.compact.mercDescription)],
    );
  }
}

/** For --no-rollup runs: reads fall back to the per-character queries until the next backfill. */
export async function markRollupNotReady(pool: Pool): Promise<void> {
  await pool.query('update meta_rollup_status set ready = false');
}
