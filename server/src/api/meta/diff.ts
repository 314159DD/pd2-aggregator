import type { Pool } from 'pg';
import { META_SLOTS, SLOT_BY_EQUIPMENT } from '../../core/static-data';
import { affixBucketKey } from './affixes';
import type { AffixSlot, CharacterDiff, MetaSlot, SlotDiff, TopItem } from './types';

type Mode = 'softcore' | 'hardcore';

export type { CharacterDiff, SlotDiff };

export type DiffUser = {
  name: string;
  account: string | null;
  level: number;
  className: string;
  mode: Mode;
  items: Array<{
    slot: string;
    isSwitch: boolean;
    name: string;
    quality: string;
    baseName: string | null;
    isRuneword: boolean;
    mods: Array<{ name: string; label: string }>;
  }>;
  mercDescription: string | null;
};

export type DiffGuide = {
  topItemsBySlot: Record<MetaSlot, TopItem[]>;
  affixModsBySlot: Record<MetaSlot, AffixSlot>;
  poolMercType: string | null;
};

const TOP_AFFIX_MODS = 5;

function displayName(it: DiffUser['items'][number]): string {
  if (it.name && (it.quality === 'Unique' || it.quality === 'Set' || it.name !== it.baseName)) return it.name;
  if (it.isRuneword) return `Runeword (${it.baseName ?? '?'})`;
  return `${it.quality || 'Unknown'} ${it.baseName ?? 'Item'}`;
}

/** Pure: one character against the cohort's top item and top affix mods per slot. */
export function diffCharacter(user: DiffUser, guide: DiffGuide): CharacterDiff {
  const slots = {} as Record<MetaSlot, SlotDiff>;
  for (const slot of META_SLOTS) {
    const inSlot = user.items.filter((it) => SLOT_BY_EQUIPMENT[it.slot] === slot);
    // Main hand wins over the weapon switch (the old code took whatever came first).
    const item = inSlot.find((it) => !it.isSwitch) ?? inSlot[0] ?? null;
    const poolTop = guide.topItemsBySlot[slot]?.[0] ?? null;
    const userMods = new Set((item?.mods ?? []).map((m) => affixBucketKey(m.name, m.label)));
    const userItemName = item ? displayName(item) : null;
    slots[slot] = {
      slot,
      poolTopItemName: poolTop?.itemName ?? null,
      userItemName,
      userItemQuality: item?.quality || null,
      userMatchesPoolTop: !!poolTop && userItemName !== null && userItemName === poolTop.itemName,
      poolTopAffixMods: (guide.affixModsBySlot[slot]?.mods ?? []).slice(0, TOP_AFFIX_MODS).map((m) => ({
        modName: m.modName,
        displayLabel: m.displayLabel,
        pct: m.pct,
        userHas: userMods.has(m.modName),
      })),
    };
  }
  const userMercType = user.mercDescription || null;
  const poolMercType = guide.poolMercType || null;
  return {
    characterName: user.name,
    accountName: user.account,
    characterLevel: user.level,
    className: user.className,
    mode: user.mode,
    mercTypeMatchesPool: poolMercType && userMercType ? poolMercType === userMercType : null,
    poolMercType,
    userMercType,
    slots,
  };
}

/**
 * Character name before account name; within each, the requested mode before the other one.
 * An account resolves to its highest-level character. Case-insensitive, bind parameters only.
 */
export async function findDiffCharacter(
  pool: Pool,
  season: number,
  mode: Mode,
  query: string,
): Promise<{ id: number; mode: Mode } | null> {
  const r = await pool.query(
    `select id, mode from characters
     where season = $1 and (lower(name) = lower($3) or lower(account) = lower($3))
     order by (lower(name) = lower($3)) desc, (mode = $2) desc, level desc, id desc
     limit 1`,
    [season, mode, query],
  );
  return r.rows[0] ? { id: Number(r.rows[0].id), mode: r.rows[0].mode } : null;
}

/** Loads the stored character and its equipped items. */
export async function loadDiffUser(pool: Pool, id: number): Promise<DiffUser | null> {
  const [c, items] = await Promise.all([
    pool.query(
      `select c.name, c.account, c.level, c.class, c.mode, m.description
       from characters c left join character_merc m on m.character_id = c.id where c.id = $1`,
      [id],
    ),
    pool.query(
      `select slot, is_switch, name, quality, base_name, is_runeword, mods
       from character_items where character_id = $1 and owner = 'player' and not is_charm and slot is not null
       order by id`,
      [id],
    ),
  ]);
  const row = c.rows[0];
  if (!row) return null;
  return {
    name: row.name,
    account: row.account ?? null,
    level: Number(row.level),
    className: row.class,
    mode: row.mode,
    mercDescription: row.description ?? null,
    items: items.rows.map((i) => ({
      slot: i.slot,
      isSwitch: i.is_switch,
      name: i.name,
      quality: i.quality,
      baseName: i.base_name ?? null,
      isRuneword: i.is_runeword,
      mods: Array.isArray(i.mods) ? i.mods.map((m: { name: string; label?: string }) => ({ name: m.name, label: m.label ?? m.name })) : [],
    })),
  };
}
