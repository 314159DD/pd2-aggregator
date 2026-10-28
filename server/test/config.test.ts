import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(c.databaseUrl).toBe('postgres://x');
    expect(c.currentSeason).toBe(14);
    expect(c.pd2MinIntervalMs).toBe(1000);
    expect(c.pauseStartHour).toBe(12);
    expect(c.pauseEndHour).toBe(14);
    expect(c.collectorEnabled).toBe(true);
    expect(c.apiPort).toBe(8080);
    expect(c.corsOrigins).toEqual([
      'https://www.pd2meta.info',
      'https://pd2meta.info',
      'http://localhost:3000',
    ]);
    expect(c.minLevel).toBe(80);
  });

  it('parses overrides', () => {
    const c = loadConfig({
      DATABASE_URL: 'x',
      COLLECTOR_ENABLED: 'false',
      CURRENT_SEASON: '15',
      CORS_ORIGINS: 'https://a.test, https://b.test',
    });
    expect(c.collectorEnabled).toBe(false);
    expect(c.currentSeason).toBe(15);
    expect(c.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('throws without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
