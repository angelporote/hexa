import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@hexa/theme';
import { en } from './en.js';
import { es } from './es.js';
import type { MessageKey } from './es.js';

export type { MessageKey };
export type Params = Readonly<Record<string, string | number>>;

const dictionaries: Record<Locale, Record<string, string>> = { es, en };
const STORAGE_KEY = 'hexa.locale';

/** Sustituye `{nombre}` por su valor; los marcadores sin valor se dejan tal cual. */
export function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return format(dictionaries[locale][key] ?? key, params);
}

/** Texto de un código de error del servidor, con un mensaje genérico de reserva. */
export function errorText(locale: Locale, code: string): string {
  const dict = dictionaries[locale];
  return dict[`err.${code}`] ?? dict['err.generic'] ?? code;
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // Sin almacenamiento disponible: se usa el idioma del navegador.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')
    ? 'en'
    : 'es';
}

interface I18n {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: MessageKey, params?: Params) => string;
  readonly error: (code: string) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Se ignora: el idioma sigue cambiando aunque no se pueda recordar.
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      error: (code) => errorText(locale, code),
    }),
    [locale, setLocale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return value;
}
