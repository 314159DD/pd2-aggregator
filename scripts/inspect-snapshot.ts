import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PATH = join(process.cwd(), "data", "snapshot.json");

function shape(value: unknown, depth = 0, maxDepth = 5): string {
  if (depth > maxDepth) return "...";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `Array<${shape(value[0], depth + 1, maxDepth)}>(${value.length})`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    return `{${keys
      .slice(0, 30)
      .map((k) => `${k}: ${shape(obj[k], depth + 1, maxDepth)}`)
      .join("; ")}}`;
  }
  return typeof value;
}

async function main() {
  const json = JSON.parse(await readFile(PATH, "utf8"));
  const chars = json.characters as Array<Record<string, unknown>>;

  console.log("=== TOP-LEVEL ===");
  console.log(shape(json, 0, 1));

  console.log("\n=== ONE CHARACTER (skipping items) ===");
  const c0 = { ...chars[0] } as Record<string, unknown>;
  delete c0.items;
  console.log(shape(c0, 0, 4));

  console.log("\n=== ONE ITEM (full) ===");
  const items = chars[0].items as Array<Record<string, unknown>>;
  console.log(JSON.stringify(items[0], null, 2));

  console.log("\n=== DISTINCT quality values across all items ===");
  const qualities = new Set<string>();
  for (const c of chars.slice(0, 50)) {
    for (const it of (c.items as Array<Record<string, unknown>>) ?? []) {
      const q = it.quality;
      if (typeof q === "string") qualities.add(q);
    }
  }
  for (const q of [...qualities].sort()) console.log(`  ${q}`);

  console.log("\n=== ONE rare/magic/crafted ITEM (to see mods shape) ===");
  outer: for (const c of chars) {
    for (const it of (c.items as Array<Record<string, unknown>>) ?? []) {
      if (it.quality === "rare" || it.quality === "magic" || it.quality === "crafted") {
        console.log(JSON.stringify(it, null, 2));
        break outer;
      }
    }
  }

  console.log("\n=== DISTINCT mod ID values across first 50 chars (sample of 50) ===");
  const modIds = new Set<string>();
  for (const c of chars.slice(0, 50)) {
    for (const it of (c.items as Array<Record<string, unknown>>) ?? []) {
      const mods = it.mods as Array<Record<string, unknown>> | undefined;
      if (!mods) continue;
      for (const m of mods) {
        if (typeof m.id === "string") modIds.add(m.id);
      }
    }
  }
  console.log(`  total distinct: ${modIds.size}`);
  for (const id of [...modIds].slice(0, 50)) console.log(`  ${id}`);

  console.log("\n=== TYPE_CODE values for charms (cm1, cm2, cm3?) ===");
  const charmCodes = new Set<string>();
  for (const c of chars.slice(0, 50)) {
    for (const it of (c.items as Array<Record<string, unknown>>) ?? []) {
      const base = it.base as Record<string, unknown> | undefined;
      const code = base?.type_code as string | undefined;
      if (code && /^cm\d/.test(code)) charmCodes.add(code);
    }
  }
  for (const c of [...charmCodes].sort()) console.log(`  ${c}`);

  console.log("\n=== character.skills shape sample ===");
  const skills = (chars[0].character as Record<string, unknown>).skills;
  console.log(shape(skills, 0, 3));

  console.log("\n=== mercenary shape ===");
  console.log(shape(chars[0].mercenary, 0, 4));

  console.log("\n=== Check for character.hardcore field ===");
  const char0 = chars[0].character as Record<string, unknown>;
  console.log(`  hardcore: ${char0.hardcore ?? "NOT FOUND"}`);
  console.log(`  all character keys: ${Object.keys(char0).join(", ")}`);

  console.log("\n=== Check for character.stats field ===");
  console.log(`  stats: ${shape(char0.stats, 0, 3)}`);

  console.log("\n=== Sample mercenary item mods ===");
  const merc = chars[0].mercenary as Record<string, unknown>;
  if (merc && typeof merc === "object") {
    const mercItems = merc.items as Array<Record<string, unknown>> | undefined;
    if (mercItems && mercItems.length > 0) {
      const firstMercItem = mercItems[0];
      const mods = firstMercItem.mods as Array<Record<string, unknown>> | undefined;
      if (mods && mods.length > 0) {
        console.log(JSON.stringify(mods[0], null, 2));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
