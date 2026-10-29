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

  it('reads pause hours from PD2_PAUSE_* vars', () => {
    const c = loadConfig({ DATABASE_URL: 'x', PD2_PAUSE_START_HOUR: '3', PD2_PAUSE_END_HOUR: '5' });
    expect(c.pauseStartHour).toBe(3);
    expect(c.pauseEndHour).toBe(5);
  });

  it('throws without DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
