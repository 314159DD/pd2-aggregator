export interface Config {
  databaseUrl: string;
  currentSeason: number;
  pd2MinIntervalMs: number;
  pauseStartHour: number;
  pauseEndHour: number;
  collectorEnabled: boolean;
  apiPort: number;
  corsOrigins: string[];
  minLevel: number;
}

const DEFAULT_CORS = [
  'https://www.pd2meta.info',
  'https://pd2meta.info',
  'http://localhost:3000',
];

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${key} must be an integer, got "${raw}"`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const cors = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CORS;
  return {
    databaseUrl,
    currentSeason: int(env, 'CURRENT_SEASON', 14),
    pd2MinIntervalMs: int(env, 'PD2_MIN_INTERVAL_MS', 1000),
    pauseStartHour: int(env, 'PD2_PAUSE_START_HOUR', 12),
    pauseEndHour: int(env, 'PD2_PAUSE_END_HOUR', 14),
    collectorEnabled: (env.COLLECTOR_ENABLED ?? 'true').toLowerCase() !== 'false',
    apiPort: int(env, 'API_PORT', 8080),
    corsOrigins: cors,
    minLevel: int(env, 'MIN_LEVEL', 80),
  };
}
