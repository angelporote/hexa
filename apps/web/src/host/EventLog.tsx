import { useI18n } from '../i18n/index.js';
import type { LoggedEvent } from '../net/connection.js';
import { describeEvent } from './describe-event.js';

const VISIBLE = 40;

/** Registro de la partida: los eventos más recientes arriba. */
export function EventLog({
  events,
  nameOf,
}: {
  events: readonly LoggedEvent[];
  nameOf: (playerId: string) => string;
}) {
  const { t, locale } = useI18n();
  const recent = events.slice(-VISIBLE).reverse();
  return (
    <section className="log" aria-label={t('game.log')}>
      <h2>{t('game.log')}</h2>
      {recent.length === 0 ? (
        <p className="muted">{t('game.noEvents')}</p>
      ) : (
        <ol>
          {recent.map((entry) => (
            <li key={entry.id}>{describeEvent(entry.event, { t, locale, name: nameOf })}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
