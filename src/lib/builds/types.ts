// Response shapes of the pd2meta read API (server/src/api/builds-*.ts, character-detail.ts, db/prices-repo.ts).

export type UsageEntry = { name: string; count: number; pct: number };
export type ItemUsageEntry = UsageEntry & {
  itemType: "Unique" | "Set" | "Runeword";
  invCode: string | null;
  medianHr: number | null;
};
export type MercUsageEntry = UsageEntry & { act: number | null };
export type BuildsUsage = {
  seasonTotal: number;
  total: number;
  breakdown: Record<string, number>;
  skills: UsageEntry[];
  items: ItemUsageEntry[];
  mercTypes: MercUsageEntry[];
  mercItems: ItemUsageEntry[];
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
  sort: "level" | "life" | "gear";
  dir: "asc" | "desc";
  characters: BuildRow[];
};

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

export type ItemPrice = { medianHr: number; samples: number; source: "sold" | "ask" };

export interface CharStats {
  //Resists
  fireRes: number;
  maxFireRes: number;
  coldRes: number;
  maxColdRes: number;
  lightningRes: number;
  maxLightningRes: number;
  poisonRes: number;
  maxPoisonRes: number;

  //Stats
  strength: number;
  dexterity: number;
  vitality: number;
  energy: number;

  //Speed
  fasterCastRate: number;
  increasedAttackSpeed: number;
  fasterHitRecovery: number;
  fasterRunWalk: number;

  //Damage Procs
  crushingBlow: number;
  criticalStrike: number;
  deadlyStrike: number;
  openWounds: number;
  openWoundsDPS: number;

  //Defensive
  physicalDamageReduction: number;

  //Rewards
  magicFind: number;
  goldFind: number;

  //Leech
  lifeLeech: number;
  manaLeech: number;
  hpPerKill: number;
  mpPerKill: number;

  //Absorb
  lAbsorbPct: number;
  lAbsorbFlat: number;
  cAbsorbPct: number;
  cAbsorbFlat: number;
  fAbsorbPct: number;
  fAbsorbFlat: number;
  mAbsorbFlat: number;

  //Elemental Skill Damage
  fireSkillDamage: number;
  coldSkillDamage: number;
  lightningSkillDamage: number;
  poisonSkillDamage: number;
  magicSkillDamage?: number;

  //Elemental Pierce
  firePierce: number;
  coldPierce: number;
  lightningPierce: number;
  poisonPierce: number;
}

export type CharacterDetail = Record<string, unknown> & {
  realStats: CharStats | null;
  gear: { valueHr: number | null; partial: boolean; mercValueHr: number | null };
  prices: Record<string, ItemPrice | null>;
  season: number;
  mode: "softcore" | "hardcore";
  lastIngestedAt: string;
};
export type CharacterHistory = {
  history: Array<{ ts: string; level: number; experience: number }>;
  total: number;
};

export type SeasonsResponse = {
  current: number;
  seasons: Array<{
    season: number;
    name: string;
    current: boolean;
    characters: { softcore: number; hardcore: number };
  }>;
};
export type BuildShareHistory = {
  days: Array<{ day: string; total: number; classes: Record<string, number> }>;
};
export type PricesResponse = {
  computedAt: string | null;
  items: Array<{
    itemType: "Unique" | "Set" | "Runeword";
    name: string;
    medianHr: number;
    samples: number;
    source: "sold" | "ask";
  }>;
};
