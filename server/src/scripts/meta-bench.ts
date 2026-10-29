import { loadConfig } from '../config';
import { createPool } from '../db/pool';
import { parseFilter } from '../api/filters';
import { CLASSES } from '../api/queries';
import { metaCohort, metaFilter } from '../api/meta/cohort';

const BUILDS: Array<{ className: string; skill: string }> = [
  { className: 'Amazon', skill: 'Lightning Fury' },
  { className: 'Assassin', skill: 'Lightning Sentry' },
  { className: 'Barbarian', skill: 'Whirlwind' },
  { className: 'Druid', skill: 'Tornado' },
  { className: 'Necromancer', skill: 'Bone Spear' },
  { className: 'Paladin', skill: 'Blessed Hammer' },
  { className: 'Sorceress', skill: 'Blizzard' },
];

const MAX_P95_MS = 1000;
const MAX_BYTES = 200000;

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const pool = createPool(cfg.databaseUrl);
  try {
    const cohorts: Array<{ label: string; query: Record<string, string> }> = [];
    for (const gameMode of ['softcore', 'hardcore']) {
      cohorts.push({ label: `${gameMode} all`, query: { gameMode } });
      for (const c of CLASSES) cohorts.push({ label: `${gameMode} ${c}`, query: { gameMode, classes: c } });
    }
    for (const b of BUILDS) {
      cohorts.push({
        label: `hardcore ${b.className} ${b.skill} 20`,
        query: { gameMode: 'hardcore', classes: b.className, skills: JSON.stringify([{ name: b.skill, minLevel: 20 }]) },
      });
    }
    const times: number[] = [];
    let maxBytes = 0;
    for (const c of cohorts) {
      const t0 = performance.now();
      const body = JSON.stringify(await metaCohort(pool, metaFilter(parseFilter(c.query, cfg))));
      const ms = Math.round(performance.now() - t0);
      const bytes = Buffer.byteLength(body);
      times.push(ms);
      maxBytes = Math.max(maxBytes, bytes);
      console.log(`${c.label} ${ms} ${bytes}`);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
    console.log(`p95 ${p95} max-bytes ${maxBytes}`);
    if (p95 > MAX_P95_MS || maxBytes > MAX_BYTES) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
