/** Mirrors server/src/api/meta/types.ts; keep in sync. */
export type MetaSlot =
  | 'helm'
  | 'armor'
  | 'weapon'
  | 'offhand'
  | 'gloves'
  | 'belt'
  | 'boots'
  | 'amulet'
  | 'ring';

/** Display order of the Meta tables. */
export const META_SLOTS: MetaSlot[] = [
  'weapon',
  'offhand',
  'helm',
  'armor',
  'gloves',
  'belt',
  'boots',
  'amulet',
  'ring',
];

export type CoreStat = {
  key: 'strength' | 'dexterity' | 'vitality' | 'energy' | 'life' | 'mana';
  label: string;
  avg: number;
};

export type AvgStat = {
  modName: string;
  displayLabel: string;
  suffix: '%' | '';
  /** Total across the pool divided by pool size (zeros included). */
  avgValue: number;
  charsWithMod: number;
  /** charsWithMod / poolSize, 0..1 */
  pctOfChars: number;
};

export type ItemPriceInfo = { medianHr: number; samples: number; source: 'sold' | 'ask' };

export type TopItem = {
  itemName: string;
  itemType: 'Unique' | 'Set' | 'Runeword';
  count: number;
  /** 0..100 */
  pct: number;
  invCode: string | null;
  price: ItemPriceInfo | null;
  runes: Array<{ rune: string; medianHr: number | null }> | null;
  runeCostHr: number | null;
  runeCostEstimated: boolean;
};

export type AffixMod = {
  modName: string;
  displayLabel: string;
  category: string;
  count: number;
  /** 0..1 of items in the slot */
  pct: number;
  medianValue: number;
  p75Value: number;
};

export type AffixSlot = { items: number; mods: AffixMod[] };

export type CharmModEntry = {
  modName: string;
  displayLabel: string;
  count: number;
  /** count / poolSize, may exceed 1 */
  pct: number;
};

export type CharmsAggregate = {
  avgCount: number;
  /** pct is 0..1 */
  annihilus: { count: number; pct: number };
  torch: { count: number; pct: number };
  gheeds: { count: number; pct: number };
  topGcMods: CharmModEntry[];
  topScMods: CharmModEntry[];
};

/** Fractions are 0..1. */
export type SkillUsageEntry = {
  name: string;
  numWithAny: number;
  numAsBuild: number;
  numAsPrereq: number;
  numAtTwenty: number;
  avgBaseLevel: number;
  avgBaseLevelAsBuild: number;
  totalSample: number;
  pctBuild: number;
  pctAny: number;
  pctAtTwenty: number;
  role: 'core' | 'synergy';
};

export type SkillFrequencyRow = {
  name: string;
  numOccurrences: number;
  totalSample: number;
  /** 0..100 */
  pct: number;
};

export type MercSummary = {
  topType: string;
  typeFrequency: Array<{
    mercType: string;
    act: number | null;
    numOccurrences: number;
    totalSample: number;
    /** 0..100 */
    pct: number;
  }>;
  topItemsBySlot: Record<
    string,
    Array<{ itemName: string; itemType: string; invCode: string | null; /** 0..100 */ pct: number }>
  >;
};

export type MetaCohort = {
  season: number;
  mode: 'softcore' | 'hardcore';
  className: string | null;
  minLevel: number;
  skills: Array<{ name: string; minLevel: number }>;
  poolSize: number;
  basePoolSize: number;
  coreStats: CoreStat[];
  avgStats: AvgStat[];
  topItemsBySlot: Record<MetaSlot, TopItem[]>;
  affixModsBySlot: Record<MetaSlot, AffixSlot>;
  charms: CharmsAggregate;
  skillFrequency: SkillFrequencyRow[];
  skillUsage: SkillUsageEntry[] | null;
  levelDistribution: Array<{ level: number; count: number }>;
  mercenary: MercSummary;
  pricesComputedAt: string | null;
};

export type SlotDiff = {
  slot: MetaSlot;
  poolTopItemName: string | null;
  userItemName: string | null;
  userItemQuality: string | null;
  userMatchesPoolTop: boolean;
  /** pct is 0..1 */
  poolTopAffixMods: Array<{ modName: string; displayLabel: string; pct: number; userHas: boolean }>;
};

export type CharacterDiff = {
  characterName: string;
  accountName: string | null;
  characterLevel: number;
  className: string;
  mode: 'softcore' | 'hardcore';
  /** null when either side has no mercenary type */
  mercTypeMatchesPool: boolean | null;
  poolMercType: string | null;
  userMercType: string | null;
  slots: Record<MetaSlot, SlotDiff>;
};
