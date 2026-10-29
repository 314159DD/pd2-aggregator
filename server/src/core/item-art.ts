import type { IItem } from './vendor/types';

/** Inventory art code of an item (ported from pd2-tools Equipment.tsx). graphic_id may be `false`. */
export function invCode(item: IItem): string | null {
  const normal = item.base?.codes?.normal;
  if (normal) return normal;
  const id = item.base?.id;
  if (!id) return null;
  return id + (Number(item.graphic_id) >= 1 ? item.graphic_id : 1);
}
