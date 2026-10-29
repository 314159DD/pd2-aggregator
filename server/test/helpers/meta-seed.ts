import type { Pool } from 'pg';
import type { CompactCharacter, CompactItem } from '../../src/core/compact';
import { upsertCharacter } from '../../src/db/characters-repo';
import { SKILL_PREREQS } from '../../src/core/static-data';

export type MkItem = {
  name?: string;
  quality: string;
  slot?: string | null;
  charm?: 'Small Charm' | 'Medium Charm' | 'Large Charm';
  runeword?: boolean;
  baseName?: string;
  owner?: 'player' | 'merc';
  invCode?: string | null;
  mods?: Array<[name: string, value: number, label?: string]>;
};

let itemSeq = 0;

function mkItem(i: MkItem): CompactItem {
  const slot = i.charm ? null : (i.slot ?? null);
  return {
    owner: i.owner ?? 'player',
    slot,
    isSwitch: slot !== null && slot.includes('Switch'),
    isCharm: !!i.charm,
    name: i.name ?? `Item ${++itemSeq}`,
    quality: i.quality,
    baseName: i.baseName ?? null,
    baseType: i.charm ?? null,
    isRuneword: !!i.runeword,
    invCode: i.invCode ?? null,
    mods: (i.mods ?? []).map(([name, value, label]) => ({ name, label: label ?? name, value })),
  };
}

export function mkChar(p: {
  name: string;
  className?: string;
  level?: number;
  mode?: 'softcore' | 'hardcore';
  attributes?: Partial<Record<'strength' | 'dexterity' | 'vitality' | 'energy', number>>;
  life?: number;
  mana?: number;
  skills?: Array<[skill: string, hard: number]>;
  items?: MkItem[];
  merc?: string | null;
  account?: string;
}): CompactCharacter {
  const level = p.level ?? 90;
  return {
    name: p.name,
    mode: p.mode ?? 'softcore',
    account: p.account ?? null,
    className: p.className ?? 'Paladin',
    level,
    experience: level * 1000,
    life: p.life ?? null,
    mana: p.mana ?? null,
    attributes: { ...(p.attributes ?? {}) } as Record<string, number>,
    guild: null,
    isDead: false,
    isLadder: true,
    skills: (p.skills ?? []).map(([skill, hard]) => ({ skill, hardLevel: hard, realLevel: hard })),
    items: (p.items ?? []).map(mkItem),
    mercDescription: p.merc ?? null,
  };
}

export async function seed(pool: Pool, chars: CompactCharacter[], season = 14): Promise<void> {
  for (const c of chars) await upsertCharacter(pool, season, c, { character: { name: c.name } });
}

const SYN_CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'];
const SYN_SLOTS = ['Helm', 'Armor', 'Right Hand', 'Left Hand', 'Gloves', 'Belt', 'Boots', 'Amulet', 'Left Ring', 'Right Ring', 'Right Hand Switch', 'Left Hand Switch'];
const SYN_TAB_LABELS = ['+1 to Combat Skills (Paladin Only)', '+2 to Combat Skills (Paladin Only)', '+3 to Cold Skills (Sorceress Only)', '+1 to Cold Skills (Sorceress Only)', '2 to Javelin and Spear Skills (Amazon Only)'];

/**
 * Bulk-inserts `count` deterministic characters with a ladder-like shape straight into the tables
 * (no upsert, no rollup maintenance; call rebuildMetaRollup afterwards): 12 equipped items, 20
 * charms (small, grand, the three unique charms), 3 merc items, ~4-8 mods per item, 25 skills.
 * Values come from hashes of the row numbers, so every run produces the same data.
 */
export async function seedSynthetic(pool: Pool, count: number, modNames: string[], season = 14): Promise<void> {
  const h = (expr: string, salt: string) => `abs(hashtext((${expr})::text || '${salt}'))`;
  await pool.query(
    `insert into characters (season, mode, name, class, level, experience, life, mana, attributes, raw, last_ingested_at)
     select $1, case when g % 10 < 7 then 'softcore' else 'hardcore' end, 'Syn' || g, ($2::text[])[1 + g % 7],
            80 + ${h('g', 'lvl')} % 20, 1000 * g, 500 + ${h('g', 'life')} % 3000, 100 + ${h('g', 'mana')} % 900,
            jsonb_build_object('strength', 50 + ${h('g', 'str')} % 200, 'dexterity', 30 + ${h('g', 'dex')} % 150,
                               'vitality', 100 + ${h('g', 'vit')} % 400, 'energy', 15 + ${h('g', 'ene')} % 100),
            $4::bytea, now()
     from generate_series(1, $3::int) g`,
    [season, SYN_CLASSES, count, Buffer.alloc(0)],
  );
  // mods(item key): 3-8 mods with a few skill tabs, negative and fractional values. $2 mod names, $3 tab labels.
  const mods = (key: string) => {
    const m = (salt: string) => h(`${key} || 'm' || k`, salt);
    return `(
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', case when ${m('tab')} % 23 = 0 then 'item_addskill_tab'
                          else ($2::text[])[1 + ${m('mod')} % cardinality($2::text[])] end,
             'label', ($3::text[])[1 + ${m('lbl')} % cardinality($3::text[])],
             'value', case when ${m('neg')} % 31 = 0 then -(${m('v')} % 5)
                           when ${m('neg')} % 37 = 0 then (${m('v')} % 40) / 4.0
                           else 1 + ${m('v')} % 60 end)), '[]'::jsonb)
    from generate_series(1, 3 + ${h(key, 'nm')} % 6) k)`;
  };
  const params = [season, modNames, SYN_TAB_LABELS];
  await pool.query(
    `insert into character_items (character_id, owner, slot, is_switch, is_charm, name, quality, base_type, is_runeword, inv_code, mods)
     select c.id, 'player', s.slot, s.slot like '%Switch', false,
            case q.q when 'Unique' then 'Unique ' || s.slot || ' ' || (${h("c.id || s.slot", 'un')} % 12)
                     when 'Set' then 'Set ' || s.slot || ' ' || (${h("c.id || s.slot", 'sn')} % 6)
                     when 'Runeword' then 'Runeword ' || (${h("c.id || s.slot", 'rn')} % 8)
                     else 'Rare ' || s.slot end,
            case q.q when 'Runeword' then 'Normal' else q.q end, null, q.q = 'Runeword',
            'inv' || (${h("c.id || s.slot", 'inv')} % 4), ${mods("c.id || s.slot")}
     from characters c
     cross join unnest($4::text[]) as s(slot)
     cross join lateral (select (array['Rare','Rare','Magic','Crafted','Unique','Unique','Set','Runeword'])[1 + ${h("c.id || s.slot", 'q')} % 8] as q) q
     where c.season = $1`,
    [...params, SYN_SLOTS],
  );
  await pool.query(
    `insert into character_items (character_id, owner, slot, is_switch, is_charm, name, quality, base_type, is_runeword, inv_code, mods)
     select c.id, 'player', null, false, true,
            case when k = 1 then 'Annihilus' when k = 2 and c.id % 3 = 0 then 'Hellfire Torch' when k = 3 and c.id % 7 = 0 then 'Gheed''s Fortune'
                 else 'Charm ' || k end,
            case when k = 1 or (k = 2 and c.id % 3 = 0) or (k = 3 and c.id % 7 = 0) then 'Unique' else 'Magic' end,
            case when k <= 7 then 'Large Charm' when k <= 18 then 'Small Charm' else 'Medium Charm' end,
            false, null, ${mods("c.id || 'charm' || k")}
     from characters c cross join generate_series(1, 20) k
     where c.season = $1`,
    params,
  );
  await pool.query(
    `insert into character_items (character_id, owner, slot, is_switch, is_charm, name, quality, base_type, is_runeword, inv_code, mods)
     select c.id, 'merc', s.slot, false, false,
            case when ${h("c.id || s.slot", 'mq')} % 2 = 0 then 'Merc Unique ' || s.slot || (${h("c.id || s.slot", 'mn')} % 5)
                 else 'Merc Runeword ' || (${h("c.id || s.slot", 'mr')} % 4) end,
            case when ${h("c.id || s.slot", 'mq')} % 2 = 0 then 'Unique' else 'Normal' end, null,
            ${h("c.id || s.slot", 'mq')} % 2 = 1, null, ${mods("c.id || 'merc' || s.slot")}
     from characters c cross join unnest(array['Helm', 'Armor', 'Right Hand']) as s(slot)
     where c.season = $1`,
    params,
  );
  const skills = Object.keys(SKILL_PREREQS.Paladin ?? {});
  await pool.query(
    `insert into character_skills (character_id, skill, hard_level, real_level)
     select c.id, sk.skill, lv.l, lv.l
     from characters c
     cross join lateral (
       select coalesce(p.skill, 'Skill ' || k) as skill, k
       from generate_series(1, 25) k
       left join lateral (select ($2::text[])[k] as skill) p on c.class = 'Paladin'
     ) sk
     cross join lateral (select case when ${h("c.id || '-' || sk.k", 'sk')} % 4 = 0 then 1 else ${h("c.id || '-' || sk.k", 'sl')} % 21 end as l) lv
     where c.season = $1`,
    [season, skills],
  );
  await pool.query(
    `insert into character_merc (character_id, description)
     select c.id, (array['Defiance', 'Holy Freeze', 'Might', 'Fire Arrow', 'Iron Wolf'])[1 + ${h('c.id', 'merc')} % 5]
     from characters c where c.season = $1 and c.id % 11 <> 0`,
    [season],
  );
}
