import type { Pool } from 'pg';
import { mercTypeOf } from '../core/merc-types';
import { filterCte } from './filter-sql';
import type { CharacterFilter } from './filters';

const PAGE_SIZE = 25 as const;
const SORT_COLUMNS = { level: 'c.level', life: 'c.life', gear: 'c.gear_value_hr' } as const;
type SortKey = keyof typeof SORT_COLUMNS;

const SLOT_ORDER = ['Helm', 'Armor', 'Right Hand', 'Left Hand', 'Gloves', 'Belt', 'Boots', 'Amulet', 'Right Ring', 'Left Ring'];
const slotRank = (slot: string | null): number => {
  if (slot === null) return SLOT_ORDER.length + 1;
  const i = SLOT_ORDER.indexOf(slot.replace(/\s*Switch\s*/i, ' ').trim());
  return i === -1 ? SLOT_ORDER.length : i;
};

export type GearIcon = { name: string; itemType: string; invCode: string | null; baseType: string | null };
export type SkillLine = { name: string; hardLevel: number; realLevel: number | null };
export type BuildRow = {
  name: string;
  className: string;
  level: number;
  life: number | null;
  account: string | null;
  topSkills: SkillLine[];
  keyGear: GearIcon[];
  gearValueHr: number | null;
  gearValuePartial: boolean;
};
export type BuildsCharactersPage = {
  total: number;
  page: number;
  pageSize: 25;
  pages: number;
  sort: SortKey;
  dir: 'asc' | 'desc';
  characters: BuildRow[];
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const typeOf = (isRuneword: boolean, quality: string): string => (isRuneword ? 'Runeword' : quality);
const priceable = (isRuneword: boolean, quality: string): boolean => isRuneword || quality === 'Unique' || quality === 'Set';

export async function buildsCharacters(
  pool: Pool,
  f: CharacterFilter,
  opts: { sort: string; dir: string; page: number },
): Promise<BuildsCharactersPage> {
  const sort: SortKey = Object.hasOwn(SORT_COLUMNS, opts.sort) ? (opts.sort as SortKey) : 'level';
  const dir: 'asc' | 'desc' = opts.dir === 'asc' ? 'asc' : 'desc';
  const parsed = Number(opts.page);
  const page = Number.isFinite(parsed) ? Math.min(100000, Math.max(1, Math.trunc(parsed))) : 1;
  const col = SORT_COLUMNS[sort];

  const { sql, params } = filterCte(f);
  const n = params.length;
  const r = await pool.query(
    `${sql}
     select t.total, p.id, p.name, p.class, p.level, p.life, p.account, p.gear_value_hr, p.gear_value_partial
     from (select count(*)::int as total from filtered) t
     left join lateral (
       select c.id, c.name, c.class, c.level, c.life, c.account, c.gear_value_hr, c.gear_value_partial, ${col} as sort_v
       from characters c join filtered on filtered.id = c.id
       order by ${col} ${dir} nulls last, c.level desc, c.id desc
       limit ${PAGE_SIZE} offset $${n + 1}
     ) p on true
     order by p.sort_v ${dir} nulls last, p.level desc, p.id desc`,
    [...params, (page - 1) * PAGE_SIZE],
  );
  const total: number = r.rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = r.rows.filter((x) => x.id !== null);
  const base = { total, page, pageSize: PAGE_SIZE, pages, sort, dir };
  if (rows.length === 0) return { ...base, characters: [] };

  const ids = rows.map((x) => x.id);
  const [skillsR, itemsR] = await Promise.all([
    pool.query(
      `select character_id, skill, hard_level, real_level from character_skills
       where character_id = any($1::bigint[])
       order by character_id, hard_level desc, real_level desc nulls last, skill asc`,
      [ids],
    ),
    pool.query(
      `select character_id, slot, name, quality, is_runeword, inv_code, base_type from character_items
       where character_id = any($1::bigint[]) and owner = 'player' and slot is not null
         and not is_switch and not is_charm`,
      [ids],
    ),
  ]);
  const skillsBy = new Map<string, SkillLine[]>();
  for (const s of skillsR.rows) {
    const k = String(s.character_id);
    const list = skillsBy.get(k) ?? [];
    if (list.length < 3) list.push({ name: s.skill, hardLevel: s.hard_level, realLevel: s.real_level });
    skillsBy.set(k, list);
  }
  const gearBy = new Map<string, Array<GearIcon & { rank: number }>>();
  for (const i of itemsR.rows) {
    if (!priceable(i.is_runeword, i.quality)) continue;
    const k = String(i.character_id);
    const list = gearBy.get(k) ?? [];
    list.push({
      name: i.name,
      itemType: typeOf(i.is_runeword, i.quality),
      invCode: i.inv_code ?? null,
      baseType: i.base_type ?? null,
      rank: slotRank(i.slot),
    });
    gearBy.set(k, list);
  }

  return {
    ...base,
    characters: rows.map((x) => ({
      name: x.name,
      className: x.class,
      level: x.level,
      life: x.life ?? null,
      account: x.account ?? null,
      topSkills: skillsBy.get(String(x.id)) ?? [],
      keyGear: (gearBy.get(String(x.id)) ?? [])
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 8)
        .map(({ rank: _rank, ...g }) => g),
      gearValueHr: num(x.gear_value_hr),
      gearValuePartial: x.gear_value_partial,
    })),
  };
}

export type PreviewItem = {
  name: string;
  itemType: string;
  quality: string;
  slot: string | null;
  isSwitch: boolean;
  isCharm: boolean;
  invCode: string | null;
  baseType: string | null;
  medianHr: number | null;
};
export type CharacterPreview = {
  name: string;
  className: string;
  level: number;
  life: number | null;
  mana: number | null;
  attributes: { strength: number; dexterity: number; vitality: number; energy: number };
  skills: SkillLine[];
  gear: PreviewItem[];
  gearValueHr: number | null;
  gearValuePartial: boolean;
  mercGearValueHr: number | null;
  merc: { type: string; act: number | null; items: PreviewItem[] } | null;
};

export async function characterPreview(
  pool: Pool,
  season: number,
  mode: 'softcore' | 'hardcore',
  name: string,
): Promise<CharacterPreview | null> {
  const c = (
    await pool.query(
      `select id, name, class, level, life, mana, attributes, gear_value_hr, gear_value_partial, merc_gear_value_hr
       from characters where season = $1 and mode = $2 and lower(name) = lower($3)
       order by id limit 1`,
      [season, mode, name],
    )
  ).rows[0];
  if (!c) return null;
  const [skillsR, itemsR, mercR] = await Promise.all([
    pool.query(
      `select skill, hard_level, real_level from character_skills where character_id = $1
       order by coalesce(real_level, hard_level) desc, hard_level desc, skill asc limit 10`,
      [c.id],
    ),
    pool.query(
      `select i.owner, i.slot, i.is_switch, i.is_charm, i.name, i.quality, i.is_runeword, i.inv_code, i.base_type, p.median_hr
       from character_items i
       left join item_prices p on p.mode = $2 and p.item_name = i.name
         and p.item_type = case when i.is_runeword then 'Runeword' else i.quality end
         and (i.is_runeword or i.quality in ('Unique','Set'))
       where i.character_id = $1 and (i.slot is not null or i.is_charm)
       order by i.id`,
      [c.id, mode],
    ),
    pool.query('select description from character_merc where character_id = $1', [c.id]),
  ]);
  const toItem = (i: any): PreviewItem => ({
    name: i.name,
    itemType: typeOf(i.is_runeword, i.quality),
    quality: i.quality,
    slot: i.slot ?? null,
    isSwitch: i.is_switch,
    isCharm: i.is_charm,
    invCode: i.inv_code ?? null,
    baseType: i.base_type ?? null,
    medianHr: num(i.median_hr),
  });
  const order = (a: PreviewItem, b: PreviewItem) =>
    Number(a.isSwitch) - Number(b.isSwitch) || slotRank(a.slot) - slotRank(b.slot);
  const player = itemsR.rows.filter((i) => i.owner === 'player');
  const gear = player
    .filter((i) => (i.slot !== null && !i.is_charm) || (i.is_charm && i.quality === 'Unique'))
    .map(toItem)
    .sort(order);
  const mercItems = itemsR.rows.filter((i) => i.owner === 'merc' && i.slot !== null).map(toItem).sort(order);
  const desc: string | undefined = mercR.rows[0]?.description;
  const a = (c.attributes ?? {}) as Record<string, number>;
  const mt = desc === undefined ? null : mercTypeOf(desc);
  return {
    name: c.name,
    className: c.class,
    level: c.level,
    life: c.life ?? null,
    mana: c.mana ?? null,
    attributes: {
      strength: a.strength ?? 0,
      dexterity: a.dexterity ?? 0,
      vitality: a.vitality ?? 0,
      energy: a.energy ?? 0,
    },
    skills: skillsR.rows.map((s) => ({ name: s.skill, hardLevel: s.hard_level, realLevel: s.real_level })),
    gear,
    gearValueHr: num(c.gear_value_hr),
    gearValuePartial: c.gear_value_partial,
    mercGearValueHr: num(c.merc_gear_value_hr),
    merc: mt === null ? null : { type: mt.name, act: mt.act, items: mercItems },
  };
}
