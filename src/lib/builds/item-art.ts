// Ported from coleestrin/pd2-tools (MIT), upstream/main web/src/components/character/Equipment.tsx.
const ITEMS_WITH_IMAGES = new Set([
  "Stalker's Cull",
  "Atma's Scarab",
  "Bul-Kathos' Wedding Band",
  "Crescent Moon",
  "Dwarf Star",
  "Highlord's Wrath",
  "Mara's Kaleidoscope",
  "Nature's Peace",
  "Raven Frost",
  "Saracen's Chance",
  "The Cat's Eye",
  "The Rising Sun",
  "Wisp Projector",
  "Templar's Might",
  "Lidless Wall",
  "Arachnid Mesh",
  "Dracul's Grasp",
  "Verdungo's Hearty Cord",
  "Nightwing's Veil",
  "Soul Drainer",
  "Arkaine's Valor",
  "Kira's Guardian",
  "Ormus' Robes",
  "Magefist",
  "Snowclash",
  "String of Ears",
  "Thundergod's Vigor",
  "Merman's Sprocket",
  "Veil of Steel",
  "Trang-Oul's Claws",
  "Tyrael's Might",
  "Griffon's Eye",
  "Harlequin Crest",
  "Mang Song's Lesson",
  "Waterwalk",
  "Silkweave",
  "Gravepalm",
  "Stormshield",
  "Medusa's Gaze",
  "Boneflame",
  "Occultist",
  "Frostburn",
  "Trang-Oul's Scales",
  "The Grandfather",
  "Skin of the Vipermagi",
  "Steelrend",
  "Spirit Ward",
  "Laying of Hands",
  "Crown of Ages",
  "Martyrdom",
  "Ravenlore",
  "Denmother",
  "Plague",
]);

const CHARM_ICONS: Record<string, string> = {
  "Small Charm": "scha",
  "Medium Charm": "mcha",
  "Large Charm": "lcha",
};

export function itemArtUrl(i: { name: string; invCode: string | null; baseType?: string | null }): string | null {
  if (i.name === "Annihilus") return "/equipment_icons/anni.png";
  if (i.name === "Hellfire Torch") return "/equipment_icons/torch.png";
  if (i.baseType && CHARM_ICONS[i.baseType]) return `/equipment_icons/${CHARM_ICONS[i.baseType]}.png`;
  if (i.name.includes("Gheed")) return "/equipment_icons/lcha.png";
  if (ITEMS_WITH_IMAGES.has(i.name)) return `/equipment_icons/${i.name.replaceAll(" ", "_")}.png`;
  if (!i.invCode) return null;
  return `https://projectdiablo2.com/image/items/inv${i.invCode}.png`;
}

export const skillIconUrl = (name: string): string => `/icons/${name.replaceAll(" ", "_")}.png`;
export const classIconUrl = (cls: string): string => `/classes/${cls}.webp`;
