import type { CharacterFilter } from './filters';

/** Builds `with filtered as materialized (select c.id ...)`. Bind parameters only. */
export function filterCte(f: CharacterFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [
    `c.season = ${p(f.season)}`,
    `c.mode = ${p(f.mode)}`,
    `c.level between ${p(f.minLevel)} and ${p(f.maxLevel)}`,
  ];
  if (f.classes.length) where.push(`c.class = any(${p(f.classes)}::text[])`);
  for (const item of f.items) {
    where.push(
      `exists (select 1 from character_items i where i.character_id = c.id and i.owner = 'player' and i.name = ${p(item)})`,
    );
  }
  for (const s of f.skills) {
    where.push(
      `exists (select 1 from character_skills s where s.character_id = c.id and s.skill = ${p(s.name)} and s.hard_level >= ${p(s.minLevel)})`,
    );
  }
  if (f.mercTypes.length) {
    where.push(
      `exists (select 1 from character_merc m where m.character_id = c.id and m.description = any(${p(f.mercTypes)}::text[]))`,
    );
  }
  for (const item of f.mercItems) {
    where.push(
      `exists (select 1 from character_items i where i.character_id = c.id and i.owner = 'merc' and i.name = ${p(item)})`,
    );
  }
  return {
    sql: `with filtered as materialized (select c.id from characters c where ${where.join(' and ')})`,
    params,
  };
}
