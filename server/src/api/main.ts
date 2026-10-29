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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
