import { describe, it, expect } from 'vitest';
import { parsePriceHr, toListingRow } from '../src/core/price';
import fx from './fixtures/listings.json';

describe('parsePriceHr', () => {
  it('parses the accepted grammar', () => {
    expect(parsePriceHr('3')).toBe(3);
    expect(parsePriceHr('0.5')).toBe(0.5);
    expect(parsePriceHr('.5')).toBe(0.5);
    expect(parsePriceHr('.50')).toBe(0.5);
    expect(parsePriceHr('2,75')).toBe(2.75);
    expect(parsePriceHr('1.5 hr')).toBe(1.5);
    expect(parsePriceHr('2.5HR')).toBe(2.5);
    expect(parsePriceHr('  3 Hr  ')).toBe(3);
  });
  it('returns null for everything else', () => {
    for (const t of ['3 wss', '0.75 ( runes keys pes pde)', 'offer', '', '0', '-1', 'abc', '1abc', '45wss', '1 hr / 30 wss', 'ist / 0.15hr']) {
      expect(parsePriceHr(t), t).toBeNull();
    }
    expect(parsePriceHr(undefined)).toBeNull();
  });
});

describe('toListingRow', () => {
  it('maps every fixture listing and keeps price_text', () => {
    const data = (fx as any).data;
    expect(data.length).toBeGreaterThan(0);
    for (const l of data) {
      const r = toListingRow(l);
      expect(r.id).toBe(l._id);
      expect(r.price_text).toBe(l.price ?? null);
      expect(r.item_name).toBe(l.item.name ?? l.item.base.name);
      expect(r.is_corrupted).toBe(l.item.corrupted === true);
      expect(r.runeword_key).toBe(l.item.runeword?.key ?? null);
      expect(r.is_ladder).toBe(l.is_ladder);
      expect(r.is_hardcore).toBe(l.is_hardcore);
    }
  });
});
