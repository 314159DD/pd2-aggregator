import { describe, it, expect } from 'vitest';
import { toCompact, enrichRaw, InvalidCharacterPayload } from '../src/core/compact';
import { calculateTotalSkills } from '../src/core/vendor/skill-calculator';
import ladder from './fixtures/character-ladder.json';
import nonLadder from './fixtures/character-nonladder.json';

const fx = ladder as any;
const nl = nonLadder as any;
const CHARM = ['Small Charm', 'Medium Charm', 'Large Charm'];

describe('toCompact', () => {
  const c = toCompact(fx);

  it('reads ladder flag, mode, identity', () => {
    expect(c.isLadder).toBe(true);
    expect(c.mode).toBe(fx.character.status.is_hardcore ? 'hardcore' : 'softcore');
    expect(c.name).toBe(fx.character.name);
    expect(c.className).toBe(fx.character.class.name);
    expect(toCompact(nl).isLadder).toBe(false);
  });

  it('uses account hint, falling back to raw account', () => {
    expect(toCompact(fx, 'Hint').account).toBe('Hint');
    expect(toCompact(fx).account).toBe(fx.account ?? null);
  });

  it('computes real skill levels', () => {
    expect(c.skills.find((s) => s.hardLevel >= 20)).toBeTruthy();
    const real = calculateTotalSkills(fx);
    for (const s of c.skills) {
      const r = real.find((x) => x.skill === s.skill);
      expect(s.realLevel).toBe(r ? r.level : null);
    }
    expect(c.skills.some((s) => s.realLevel !== null)).toBe(true);
  });

  it('keeps only equipped items and inventory charms for the player', () => {
    const player = c.items.filter((i) => i.owner === 'player');
    expect(player.length).toBeGreaterThan(0);
    for (const i of player) {
      if (i.isCharm) {
        expect(CHARM).toContain(i.baseType);
      } else {
        expect(i.slot).toBeTruthy();
      }
    }
    const equipped = fx.items.filter((i: any) => i.location.zone === 'Equipped');
    const charms = fx.items.filter(
      (i: any) => CHARM.includes(i.base.type) && i.location.storage === 'Inventory',
    );
    expect(player.length).toBe(equipped.length + charms.length);
    expect(player.filter((i) => !i.isCharm).every((i) => i.slot !== null)).toBe(true);
  });

  it('drops stash/cube items', () => {
    const raw = structuredClone(fx);
    raw.items.push({
      ...structuredClone(raw.items[0]),
      location: { zone: 'Stored', storage: 'Stash', equipment: null },
    });
    raw.items.push({
      ...structuredClone(raw.items[0]),
      location: { zone: 'Stored', storage: 'Cube', equipment: null },
    });
    expect(toCompact(raw).items.length).toBe(c.items.length);
  });

  it('flags switch slots', () => {
    const n = toCompact(nl);
    const sw = n.items.filter((i) => i.owner === 'player' && i.slot?.includes('Switch'));
    expect(sw.length).toBe(2);
    expect(sw.every((i) => i.isSwitch)).toBe(true);
    expect(n.items.filter((i) => !i.slot?.includes('Switch')).every((i) => !i.isSwitch)).toBe(true);
  });

  it('copies modifier values', () => {
    const src = fx.items.find((i: any) => i.location.zone === 'Equipped');
    const out = c.items.find((i) => i.owner === 'player' && i.name === src.name)!;
    expect(out.mods.length).toBe(src.modifiers.length);
    out.mods.forEach((m, k) => {
      expect(m.value).toBe(src.modifiers[k].values?.[0] ?? null);
      expect(m.name).toBe(src.modifiers[k].name);
      expect(m.label).toBe(src.modifiers[k].label);
    });
  });

  it('handles the mercenary', () => {
    expect(c.mercDescription).toBe(fx.mercenary.description);
    const merc = c.items.filter((i) => i.owner === 'merc');
    expect(merc.length).toBe(fx.mercenary.items.length);
    expect(merc.every((i) => !i.isCharm)).toBe(true);
  });

  it('falls back to base name and reads runeword/quality', () => {
    const raw = structuredClone(fx);
    const eq = raw.items.find((i: any) => i.location.zone === 'Equipped');
    delete eq.name;
    eq.is_runeword = true;
    const out = toCompact(raw).items.find((i) => i.name === eq.base.name && i.isRuneword);
    expect(out).toBeTruthy();
    expect(out!.quality).toBe(eq.quality.name);
  });

  it('tolerates missing mercenary', () => {
    const out = toCompact({ character: fx.character, items: [] } as any);
    expect(out.items).toEqual([]);
    expect(out.mercDescription).toBeNull();
  });
});

describe('unusual payloads', () => {
  it('items null', () => {
    const raw = { ...structuredClone(fx), items: null };
    const out = toCompact(raw);
    expect(out.items.every((i) => i.owner === 'merc')).toBe(true);
    expect(() => enrichRaw(raw, 'A')).not.toThrow();
  });
  it('character.skills null', () => {
    const raw = structuredClone(fx);
    raw.character.skills = null;
    expect(toCompact(raw).skills).toEqual([]);
    expect((enrichRaw(raw, 'A') as any).realSkills).toBeDefined();
  });
  it('item without properties', () => {
    const raw = structuredClone(fx);
    for (const i of raw.items) delete i.properties;
    const out = toCompact(raw);
    expect(out.skills.length).toBeGreaterThan(0);
    expect(() => enrichRaw(raw, 'A')).not.toThrow();
  });
  it('missing character', () => {
    expect(() => toCompact({ items: [] } as any)).toThrow(InvalidCharacterPayload);
    expect(() => toCompact({ character: null, items: [] } as any)).toThrow(InvalidCharacterPayload);
  });
});

describe('enrichRaw', () => {
  it('adds account, realSkills and timestamp', () => {
    const before = Date.now();
    const e = enrichRaw(fx, 'Acc') as any;
    expect(e.accountName).toBe('Acc');
    expect(e.realSkills).toEqual(calculateTotalSkills(fx));
    expect(e.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(e.character.name).toBe(fx.character.name);
  });
});
