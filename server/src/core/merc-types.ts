export const MERC_TYPES: Record<string, { act: 1 | 2 | 3 | 4 | 5 }> = {
  'Fire Arrow': { act: 1 },
  'Cold Arrow': { act: 1 },
  'Physical Arrow': { act: 1 },
  'Defensive Auras': { act: 2 },
  'Offensive Auras': { act: 2 },
  Combat: { act: 2 },
  'Fire Spells': { act: 3 },
  'Cold Spells': { act: 3 },
  'Lightning Spells': { act: 3 },
  Dark: { act: 4 },
  Light: { act: 4 },
  'Might Merc': { act: 5 },
  Warcries: { act: 5 },
};

const warned = new Set<string>();

export function mercTypeOf(raw: string): { name: string; act: number | null } {
  const known = Object.hasOwn(MERC_TYPES, raw) ? MERC_TYPES[raw] : undefined;
  if (known) return { name: raw, act: known.act };
  if (!warned.has(raw)) {
    warned.add(raw);
    console.warn(`unknown merc type "${raw}"`);
  }
  return { name: 'Other', act: null };
}
