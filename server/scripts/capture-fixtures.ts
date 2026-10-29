// Captures real upstream payloads into test/fixtures. Run: npx tsx scripts/capture-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://api.projectdiablo2.com';
const UA = 'pd2meta.info/2.0 (+https://www.pd2meta.info)';
const OUT = join(__dirname, '..', 'test', 'fixtures');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T = any>(path: string): Promise<T> {
  await sleep(1000);
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

function save(name: string, data: unknown) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 1));
  console.log('saved', name);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  save('ladder.json', await get('/game/ladder'));
  const online: string[] = await get('/game/online');
  save('online.json', online);

  let ladderChar: string | null = null;
  let nonLadderChar: string | null = null;
  for (const acct of online) {
    let a: any;
    try { a = await get(`/game/account/${encodeURIComponent(acct)}`); } catch { continue; }
    const d: any[] = a.details ?? [];
    const l = d.find((c) => c.ladder && c.level >= 80);
    if (!l) continue;
    save('account.json', a);
    ladderChar = l.name;
    nonLadderChar = d.find((c) => !c.ladder)?.name ?? null;
    break;
  }
  if (!ladderChar) throw new Error('no online account with a ladder char >= 80');
  save('character-ladder.json', await get(`/game/character/${encodeURIComponent(ladderChar)}`));

  if (!nonLadderChar) {
    // fall back: scan more online accounts for a non-ladder character
    for (const acct of online) {
      let a: any;
      try { a = await get(`/game/account/${encodeURIComponent(acct)}`); } catch { continue; }
      const c = (a.details ?? []).find((x: any) => !x.ladder && x.level >= 30);
      if (c) { nonLadderChar = c.name; break; }
    }
  }
  if (!nonLadderChar) throw new Error('no non-ladder character found');
  save('character-nonladder.json', await get(`/game/character/${encodeURIComponent(nonLadderChar)}`));

  save('listings.json', await get('/market/listing?$limit=50&$sort[bumped_at]=-1'));
}

main().catch((e) => { console.error(e); process.exit(1); });
