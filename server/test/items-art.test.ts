import { describe, it, expect } from 'vitest';
import { invCode } from '../src/core/item-art';
import { toCompact } from '../src/core/compact';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;

describe('invCode', () => {
  it("uses codes.normal for Nightwing's Veil", () => {
    const it = fx.items.find((i: any) => i.name === "Nightwing's Veil");
    expect(invCode(it)).toBe('ghm');
  });
  it('falls back to base id plus graphic id', () => {
    const mk = (g: number | boolean) => ({ base: { id: 'amu', codes: { normal: '' } }, graphic_id: g }) as any;
    expect(invCode(mk(0))).toBe('amu1');
    expect(invCode(mk(false))).toBe('amu1');
    expect(invCode(mk(3))).toBe('amu3');
  });
  it('is null without a base', () => {
    expect(invCode({ graphic_id: 2 } as any)).toBeNull();
  });
  it('is set on every compact item', () => {
    for (const i of toCompact(fx).items) expect(i.invCode).not.toBeUndefined();
  });
});
