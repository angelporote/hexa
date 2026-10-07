import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.js';

const TICK_MS = 250;
/** A partir de aquí el contador avisa de que se acaba el tiempo. */
export const URGENT_SECONDS = 10;

/** Segundos que faltan para `endsAt` (hora local), actualizados varias veces por segundo. */
export function useRemainingSeconds(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** `m:ss`. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Cuenta atrás hasta `endsAt`; se pone en rojo en los últimos segundos. */
export function Countdown({
  endsAt,
  className = '',
  label,
}: {
  endsAt: number;
  className?: string;
  /** Texto para lectores de pantalla; por defecto «Tiempo restante». */
  label?: (seconds: number) => string;
}) {
  const { t } = useI18n();
  const seconds = useRemainingSeconds(endsAt);
  if (seconds === null) return null;
  const classes = ['countdown', seconds <= URGENT_SECONDS ? 'urgent' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={classes}
      role="timer"
      aria-label={label?.(seconds) ?? t('clock.label', { seconds })}
    >
      {formatClock(seconds)}
    </span>
  );
}
