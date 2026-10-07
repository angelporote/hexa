import { RESOURCE_IDS } from '@hexa/engine';
import type { PlayerView } from '@hexa/engine';
import { devCardName, resourceName } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { ResourceIcon } from './ResourceIcon.js';
import { useGains } from './use-gains.js';

/** Mano privada: cartas de recurso (con cantidad) y cartas de desarrollo. */
export function Hand({ you }: { you: NonNullable<PlayerView['you']> }) {
  const { t, locale } = useI18n();
  const gains = useGains(you.hand);
  const received = RESOURCE_IDS.flatMap((r) => {
    const gain = gains[r];
    return gain ? [`${gain.amount} ${resourceName(locale, r)}`] : [];
  });
  return (
    <section className="hand" aria-label={t('ctl.hand')}>
      <h2>{t('ctl.hand')}</h2>
      {/* Lo que se acaba de recibir, para lectores de pantalla (el aviso visual es el «+N»). */}
      <p className="sr-only" role="status" aria-live="polite">
        {received.length > 0 ? t('ctl.gained', { list: received.join(', ') }) : ''}
      </p>
      <ul className="hand-resources">
        {RESOURCE_IDS.map((r) => (
          <li key={r} className={you.hand[r] === 0 ? 'empty' : undefined}>
            <ResourceIcon resource={r} size={26} />
            <span className="count" aria-label={`${resourceName(locale, r)}: ${you.hand[r]}`}>
              {you.hand[r]}
            </span>
            <span className="name">{resourceName(locale, r)}</span>
            {gains[r] && (
              <span key={gains[r]?.key} className="gain" aria-hidden="true">
                +{gains[r]?.amount}
              </span>
            )}
          </li>
        ))}
      </ul>
      <h3>{t('ctl.devCards')}</h3>
      {you.devCards.length === 0 ? (
        <p className="muted">{t('ctl.noDevCards')}</p>
      ) : (
        <ul className="hand-cards">
          {you.devCards.map((card, i) => (
            <li key={i} className={card.card === 'point' ? 'card hidden-point' : 'card'}>
              {card.card === 'point' ? t('ctl.hiddenPoint') : devCardName(locale, card.card)}
              {!card.playable && card.card !== 'point' && (
                <span className="tag">{t('ctl.newCard')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
