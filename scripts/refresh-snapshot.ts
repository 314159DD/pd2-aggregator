import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const URL = "https://api.pd2.tools/api/v1/characters";
const OUT = join(process.cwd(), "data", "snapshot.json");

async function main() {
  console.log(`Fetching ${URL} ...`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(OUT, text, "utf8");
  const json = JSON.parse(text);
  console.log(`Wrote ${OUT}`);
  console.log(`  total: ${json.total}`);
  console.log(`  characters in payload: ${json.characters.length}`);
  console.log(`  size: ${(text.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
