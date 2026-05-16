/**
 * build-price-snapshot.ts
 *
 * Builds public/price-snapshot.json and data/unique-ids.json by harvesting
 * listings from api.projectdiablo2.com/market/listing.
 *
 * Run:  npx tsx scripts/build-price-snapshot.ts
 * Re-run after each PD2 patch.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parsePriceHr, median } from "../src/lib/price/parse";

const API = "https://api.projectdiablo2.com/market/listing";
const PAGE_SIZE = 250;
const SAMPLE_PER_ITEM = 50;
const PACE_MS = 200;

type Identity =
  | { type: "Unique"; uniqueId: number }
  | { type: "Set" }
  | { type: "Runeword"; runewordKey: string };

type Listing = {
  price?: string;
  item?: { name?: string; corrupted?: boolean; unique?: { id?: number }; runeword?: { key?: string; name?: string } };
};

export type PriceEntry = {
  type: "Unique" | "Set" | "Runeword";
  uniqueId?: number;
  runewordKey?: string;
  medianHr: number;
  low: number;
  high: number;
  sampleCount: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<{ total: number; data: Listing[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

export function computePriceEntry(
  listings: Listing[],
  identity: Identity,
): PriceEntry | null {
  const prices = listings
    .filter((l) => !l.item?.corrupted)
    .map((l) => parsePriceHr(l.price))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const med = median(prices);
  return {
    type: identity.type,
    uniqueId: identity.type === "Unique" ? identity.uniqueId : undefined,
    runewordKey: identity.type === "Runeword" ? identity.runewordKey : undefined,
    medianHr: Math.round(med * 10) / 10,
    low: Math.round(Math.min(...prices) * 10) / 10,
    high: Math.round(Math.max(...prices) * 10) / 10,
    sampleCount: prices.length,
  };
}

async function harvestUniqueIds(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.quality.name=Unique`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.name;
      const id = l.item?.unique?.id;
      if (name && id != null && !map.has(name)) map.set(name, id);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return map;
}

async function harvestRunewordKeys(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.is_runeword=true`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.runeword?.name;
      const key = l.item?.runeword?.key;
      if (name && key && !map.has(name)) map.set(name, key);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return map;
}

async function harvestSetPieceNames(): Promise<Set<string>> {
  const set = new Set<string>();
  let skip = 0;
  for (;;) {
    const url = `${API}?%24limit=${PAGE_SIZE}&%24skip=${skip}&item.quality.name=Set`;
    const page = await get(url);
    for (const l of page.data) {
      const name = l.item?.name;
      if (name) set.add(name);
    }
    skip += page.data.length;
    if (page.data.length < PAGE_SIZE || skip >= page.total) break;
    await sleep(PACE_MS);
  }
  return set;
}

async function priceUnique(name: string, id: number): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.corrupted=false&item.unique.id=${id}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Unique", uniqueId: id });
}

async function priceRuneword(name: string, key: string): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.corrupted=false&item.is_runeword=true&item.runeword.key=${key}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Runeword", runewordKey: key });
}

async function priceSetPiece(name: string): Promise<PriceEntry | null> {
  const url = `${API}?%24limit=${SAMPLE_PER_ITEM}&%24sort%5Bprice%5D=1&item.corrupted=false&item.quality.name=Set&item.name=${encodeURIComponent(name)}`;
  const page = await get(url);
  return computePriceEntry(page.data, { type: "Set" });
}

async function main() {
  const root = process.cwd();
  const itemSlots = JSON.parse(
    await readFile(join(root, "data", "item-slots.json"), "utf8"),
  ) as Record<string, string>;
  const knownNames = new Set(Object.keys(itemSlots));

  console.log("Harvesting unique IDs...");
  const uniqueIds = await harvestUniqueIds();
  console.log(`  found ${uniqueIds.size} uniques`);

  console.log("Harvesting runeword keys...");
  const runewordKeys = await harvestRunewordKeys();
  console.log(`  found ${runewordKeys.size} runewords`);

  console.log("Harvesting set piece names...");
  const setNames = await harvestSetPieceNames();
  console.log(`  found ${setNames.size} set pieces`);

  await writeFile(
    join(root, "data", "unique-ids.json"),
    JSON.stringify(Object.fromEntries([...uniqueIds].sort()), null, 2) + "\n",
    "utf8",
  );

  const items: Record<string, PriceEntry> = {};
  const unmatched: string[] = [];

  let i = 0;
  for (const [name, id] of uniqueIds) {
    i++;
    if (i % 25 === 0) console.log(`  unique ${i}/${uniqueIds.size}: ${name}`);
    const entry = await priceUnique(name, id);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  i = 0;
  for (const [name, key] of runewordKeys) {
    i++;
    if (i % 25 === 0) console.log(`  runeword ${i}/${runewordKeys.size}: ${name}`);
    const entry = await priceRuneword(name, key);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  i = 0;
  for (const name of setNames) {
    i++;
    if (i % 25 === 0) console.log(`  set ${i}/${setNames.size}: ${name}`);
    const entry = await priceSetPiece(name);
    if (entry) items[name] = entry;
    await sleep(PACE_MS);
  }

  // Drop entries whose median rounded to 0 HR. Sub-0.05 HR is junk territory
  // and showing "0 HR" reads as broken in the UI.
  for (const [name, entry] of Object.entries(items)) {
    if (entry.medianHr === 0) delete items[name];
  }

  // Naming aliases: pd2 market uses "The X" for many uniques (e.g.
  // "The Stone of Jordan"), while pd2.tools uses "X". data/item-slots.json
  // carries both forms. For each priced entry that starts with "The ",
  // emit a duplicate under the bare name so frontend lookups hit either way.
  for (const [name, entry] of Object.entries({ ...items })) {
    if (name.startsWith("The ")) {
      const bare = name.slice(4);
      if (!(bare in items)) items[bare] = entry;
    } else if (!(`The ${name}` in items)) {
      items[`The ${name}`] = entry;
    }
  }

  for (const name of knownNames) {
    if (!(name in items)) unmatched.push(name);
  }

  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(
    join(root, "public", "price-snapshot.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        items: Object.fromEntries(Object.entries(items).sort()),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  if (unmatched.length > 0) {
    await writeFile(
      join(root, "data", "price-snapshot.unmatched.json"),
      JSON.stringify(unmatched.sort(), null, 2) + "\n",
      "utf8",
    );
  }

  console.log(`\nDone. ${Object.keys(items).length} priced items written.`);
  console.log(`Unmatched: ${unmatched.length} (see data/price-snapshot.unmatched.json)`);
}

if (process.argv[1] && process.argv[1].endsWith("build-price-snapshot.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
