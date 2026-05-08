import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://api.pd2.tools/api/v1/characters";
const PAGES = 5;
const FILTERS = "gameMode=hardcore&minLevel=80";
const OUT = join(process.cwd(), "data", "snapshot.json");

type ApiResp = { total: number; characters: unknown[] };

async function fetchPage(page: number): Promise<ApiResp> {
  const url = `${BASE}?${FILTERS}&page=${page}`;
  console.log(`Fetching page ${page} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return (await res.json()) as ApiResp;
}

async function main() {
  const all: unknown[] = [];
  let total = 0;
  for (let p = 1; p <= PAGES; p++) {
    const j = await fetchPage(p);
    total = j.total;
    all.push(...j.characters);
  }
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  const out = {
    fetchedAt: Date.now(),
    filters: FILTERS,
    pagesFetched: PAGES,
    sampleSize: all.length,
    populationTotal: total,
    characters: all,
  };
  const text = JSON.stringify(out);
  await writeFile(OUT, text, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`  population total (HC >=80): ${total}`);
  console.log(`  sampled: ${all.length}`);
  console.log(`  size: ${(text.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
