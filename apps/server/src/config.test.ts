import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('sin variables usa los valores por defecto y guarda las salas en memoria', () => {
    expect(loadConfig({})).toMatchObject({ port: 3001, redisUrl: null, roomTtlMs: 21_600_000 });
  });

  it('REDIS_URL activa Redis; vacío o en blanco lo desactiva', () => {
    expect(loadConfig({ REDIS_URL: 'redis://localhost:6379' }).redisUrl).toBe(
      'redis://localhost:6379',
    );
    expect(loadConfig({ REDIS_URL: '  redis://r:1  ' }).redisUrl).toBe('redis://r:1');
    expect(loadConfig({ REDIS_URL: '' }).redisUrl).toBeNull();
    expect(loadConfig({ REDIS_URL: '   ' }).redisUrl).toBeNull();
  });

  it('GAME_SEED fija la semilla de todas las partidas; vacía o en blanco, no', () => {
    expect(loadConfig({}).gameSeed).toBeNull();
    expect(loadConfig({ GAME_SEED: ' e2e-231 ' }).gameSeed).toBe('e2e-231');
    expect(loadConfig({ GAME_SEED: '' }).gameSeed).toBeNull();
    expect(loadConfig({ GAME_SEED: '  ' }).gameSeed).toBeNull();
  });

  it('los números inválidos caen al valor por defecto', () => {
    expect(loadConfig({ PORT: 'abc', ROOM_TTL_MS: '-5' })).toMatchObject({
      port: 3001,
      roomTtlMs: 21_600_000,
    });
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });
});
