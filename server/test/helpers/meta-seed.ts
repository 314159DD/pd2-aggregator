import type { Pool } from 'pg';
import type { CompactCharacter, CompactItem } from '../../src/core/compact';
import { upsertCharacter } from '../../src/db/characters-repo';

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
