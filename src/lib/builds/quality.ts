export function qualityClass(itemType: string): string {
  switch (itemType) {
    case "Unique":
      return "text-q-unique";
    case "Set":
      return "text-q-set";
    case "Runeword":
      return "text-q-runeword";
    case "Rare":
      return "text-q-rare";
    case "Magic":
      return "text-q-magic";
    case "Crafted":
      return "text-q-crafted";
    default:
      return "text-ink";
  }
}
