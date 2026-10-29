import type { RawListing } from '../upstream/pd2-client';

// Accepted grammar (ported from the web app): a plain number, a leading-dot
// fraction, or a comma decimal, with an optional "hr" suffix. Anything else is null.
const HR_PATTERN = /^\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:hr)?\s*$/i;

export function parsePriceHr(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.match(HR_PATTERN);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type MarketListingRow = {
  id: string;
  item_name: string | null;
  quality: string | null;
  base_name: string | null;
  runeword_key: string | null;
  is_corrupted: boolean;
  is_ladder: boolean;
  is_hardcore: boolean;
  price_text: string | null;
  price_hr: number | null;
  created_at: string | null;
  bumped_at: string | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function toListingRow(l: RawListing): MarketListingRow {
  const item = (l.item ?? {}) as any;
  const baseName = str(item.base?.name);
  return {
    id: l._id,
    item_name: str(item.name) ?? baseName,
    quality: str(item.quality?.name),
    base_name: baseName,
    runeword_key: str(item.runeword?.key),
    is_corrupted: item.corrupted === true,
    is_ladder: l.is_ladder === true,
    is_hardcore: l.is_hardcore === true,
    price_text: typeof l.price === 'string' ? l.price : null,
    price_hr: parsePriceHr(l.price),
    created_at: str(l.created_at),
    bumped_at: str(l.bumped_at),
  };
}
