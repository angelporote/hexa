import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { es } from './es.js';
import { errorText, format, translate } from './index.js';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('i18n', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('cada texto usa los mismos marcadores en los dos idiomas', () => {
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(es[key]));
    }
  });

  it('ningún texto está vacío', () => {
    for (const text of [...Object.values(es), ...Object.values(en)]) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it('sustituye marcadores y deja intactos los que no tienen valor', () => {
    expect(format('Hola {name}, tienes {n}', { name: 'Ana', n: 3 })).toBe('Hola Ana, tienes 3');
    expect(format('Hola {name}', {})).toBe('Hola {name}');
    expect(translate('es', 'lobby.needPlayers', { min: 2 })).toBe(
      'Hacen falta al menos 2 jugadores',
    );
    expect(translate('en', 'lobby.needPlayers', { min: 2 })).toBe('At least 2 players are needed');
  });

  it('traduce los códigos de error y cae en un mensaje genérico', () => {
    expect(errorText('es', 'ROOM_FULL')).toBe(es['err.ROOM_FULL']);
    expect(errorText('en', 'ROOM_FULL')).toBe(en['err.ROOM_FULL']);
    expect(errorText('es', 'CODIGO_RARO')).toBe(es['err.generic']);
  });
});
