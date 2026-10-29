import { loadConfig } from '../config';
import { migrate } from '../db/migrate';
import { createPool } from '../db/pool';
import { createApp } from './app';

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const pool = createPool(cfg.databaseUrl);
  await migrate(pool);
  const app = createApp({ pool, cfg });
  app.listen(cfg.apiPort, () => console.log(`${new Date().toISOString()} INFO api listening on ${cfg.apiPort}`));
  let warming = false;
  const warm = (): void => {
    if (warming) return;
    warming = true;
    (app.locals.warmMeta as () => Promise<number>)()
      .catch((e) => console.warn(`${new Date().toISOString()} WARN meta warm-up failed`, e))
      .finally(() => {
        warming = false;
      });
  };
  warm();
  setInterval(warm, 14 * 60 * 1000).unref();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
