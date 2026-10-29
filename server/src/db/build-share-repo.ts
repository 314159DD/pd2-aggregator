import type { Pool } from 'pg';
import { CLASSES } from '../api/queries';

const MODES = ['softcore', 'hardcore'] as const;

/** Upserts one row per (mode, class), zero-filled, counting level 80+ characters of the season. Same-day reruns overwrite. */
export async function snapshotBuildShare(pool: Pool, season: number, day: string): Promise<number> {
  const r = await pool.query(
    `insert into build_share_daily (season, mode, day, class, characters)
     select $1, m.mode, $2::date, c.class,
            (select count(*)::int from characters ch
              where ch.season = $1 and ch.mode = m.mode and ch.class = c.class and ch.level >= 80)
     from unnest($3::text[]) as m(mode) cross join unnest($4::text[]) as c(class)
     on conflict (season, mode, day, class) do update set characters = excluded.characters`,
    [season, day, [...MODES], [...CLASSES]],
  );
  return r.rowCount ?? 0;
}
