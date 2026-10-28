import { calculateTotalSkills } from './vendor/skill-calculator';
import type { CharacterApiResponse, CharacterResponse, IItem } from './vendor/types';

export type CompactItem = {
  owner: 'player' | 'merc';
  slot: string | null;
  isSwitch: boolean;
  isCharm: boolean;
  name: string;
  quality: string;
  baseName: string | null;
  baseType: string | null;
  isRuneword: boolean;
  mods: Array<{ name: string; label: string; value: number | null }>;
};

export type CompactCharacter = {
  name: string;
  mode: 'softcore' | 'hardcore';
  account: string | null;
  className: string;
  level: number;
  experience: number;
  life: number | null;
  mana: number | null;
  attributes: Record<string, number>;
  guild: string | null;
  isDead: boolean;
  isLadder: boolean;
  skills: Array<{ skill: string; hardLevel: number; realLevel: number | null }>;
  items: CompactItem[];
  mercDescription: string | null;
};

const CHARM_TYPES = new Set(['Small Charm', 'Medium Charm', 'Large Charm']);

function isCharm(item: IItem): boolean {
  return CHARM_TYPES.has(item.base?.type) && item.location?.storage === 'Inventory';
}

function toCompactItem(item: IItem, owner: 'player' | 'merc'): CompactItem | null {
  const equipped = item.location?.zone === 'Equipped' && !!item.location.equipment;
  const charm = owner === 'player' && isCharm(item);
  // Stored items outside the inventory-charm case (stash, cube, bags) are not part of a build.
  if (!equipped && !charm) return null;
  // Stored charms carry a bogus `equipment` value in the API, so only equipped items get a slot.
  const slot: string | null = equipped ? (item.location.equipment ?? null) : null;
  return {
    owner,
    slot,
    isSwitch: slot !== null && slot.includes('Switch'),
    isCharm: charm,
    name: item.name || item.base?.name || '',
    quality: item.quality?.name ?? '',
    baseName: item.base?.name ?? null,
    baseType: item.base?.type ?? null,
    isRuneword: !!item.is_runeword,
    mods: (item.modifiers ?? []).map((m) => {
      const v = m.values?.[0];
      return { name: m.name, label: m.label, value: (v ?? null) as number | null };
    }),
  };
}

export function toCompact(raw: CharacterApiResponse, accountHint?: string): CompactCharacter {
  const r = raw as unknown as CharacterResponse & { account?: string | null; guild?: string | null };
  const ch = r.character!;
  const real = calculateTotalSkills(r);
  const realByName = new Map(real.map((s) => [s.skill, s.level]));
  const items: CompactItem[] = [];
  for (const it of r.items ?? []) {
    const c = toCompactItem(it, 'player');
    if (c) items.push(c);
  }
  for (const it of r.mercenary?.items ?? []) {
    const c = toCompactItem(it, 'merc');
    if (c) items.push(c);
  }
  return {
    name: ch.name,
    mode: ch.status?.is_hardcore ? 'hardcore' : 'softcore',
    account: accountHint ?? r.account ?? null,
    className: ch.class?.name ?? '',
    level: ch.level,
    experience: ch.experience,
    life: ch.life ?? null,
    mana: ch.mana ?? null,
    attributes: { ...(ch.attributes as unknown as Record<string, number>) },
    guild: typeof r.guild === 'string' ? r.guild : ((r.guild as { name?: string } | null)?.name ?? null),
    isDead: !!ch.status?.is_dead,
    isLadder: !!ch.status?.is_ladder,
    skills: (ch.skills ?? []).map((s) => ({
      skill: s.name,
      hardLevel: s.level,
      realLevel: realByName.get(s.name) ?? null,
    })),
    items,
    mercDescription: r.mercenary?.description ?? null,
  };
}

/** Shape pd2.tools stored in full_response_json, which pd2meta reads. */
export function enrichRaw(raw: CharacterApiResponse, accountName: string): object {
  return {
    ...raw,
    accountName,
    realSkills: calculateTotalSkills(raw as unknown as CharacterResponse),
    lastUpdated: Date.now(),
  };
}
