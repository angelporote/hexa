import type { ReactNode } from 'react';
import type { TradeCounter, TradeOffer } from '@hexa/engine';
import { playerColor } from '@hexa/theme';
import { CountsRow } from '../controller/CountsRow.js';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';

function Who({ id, infos }: { id: string; infos: ReadonlyMap<string, PlayerInfo> }) {
  const info = infos.get(id);
  const swatch = playerColor(info?.color ?? 'c1');
  return (
    <span className="who">
      <span className="swatch" style={{ background: swatch.fill, borderColor: swatch.stroke }} />
      {info?.name ?? id}
    </span>
  );
}

/**
 * Resumen público de una oferta de comercio: qué da y qué pide el oferente, a quién va y cómo
 * han respondido los demás. Lo usan la pantalla principal y el mando; este último añade botones
 * por medio de `acceptedAction` y `counterAction`.
 */
export function OfferSummary({
  offer,
  playerIds,
  infos,
  acceptedAction,
  counterAction,
}: {
  offer: TradeOffer;
  /** Todos los jugadores de la partida, para saber quién falta por responder. */
  playerIds: readonly string[];
  infos: ReadonlyMap<string, PlayerInfo>;
  acceptedAction?: ((playerId: string) => ReactNode) | undefined;
  counterAction?: ((counter: TradeCounter) => ReactNode) | undefined;
}) {
  const { t } = useI18n();
  const recipients = playerIds.filter(
    (id) => id !== offer.from && (offer.to === null || offer.to.includes(id)),
  );
  const answered = new Set([
    ...offer.accepted,
    ...offer.rejected,
    ...offer.counters.map((c) => c.from),
  ]);
  const waiting = recipients.filter((id) => !answered.has(id));

  return (
    <div className="offer" data-offer={offer.id}>
      <p className="offer-head">
        <Who id={offer.from} infos={infos} /> {t('trade.proposes')}
        <span className="muted">
          {' · '}
          {offer.to === null
            ? t('trade.toEveryone')
            : t('trade.toWho', {
                players: recipients.map((id) => infos.get(id)?.name ?? id).join(', '),
              })}
        </span>
      </p>
      <dl className="offer-terms">
        <div>
          <dt>{t('trade.gives')}</dt>
          <dd>
            <CountsRow counts={offer.give} />
          </dd>
        </div>
        <div>
          <dt>{t('trade.asks')}</dt>
          <dd>
            <CountsRow counts={offer.want} />
          </dd>
        </div>
      </dl>

      <ul className="offer-status">
        {offer.accepted.map((id) => (
          <li key={`a-${id}`} className="status-accepted">
            <span className="tag tag-ok">{t('trade.accepted')}</span> <Who id={id} infos={infos} />
            {acceptedAction?.(id)}
          </li>
        ))}
        {offer.counters.map((c) => (
          <li key={`c-${c.from}`} className="status-counter">
            <span className="tag tag-award">{t('trade.counters')}</span>{' '}
            <Who id={c.from} infos={infos} />
            <span className="counter-terms">
              {t('trade.gives')} <CountsRow counts={c.give} size={18} /> · {t('trade.asks')}{' '}
              <CountsRow counts={c.want} size={18} />
            </span>
            {counterAction?.(c)}
          </li>
        ))}
        {offer.rejected.map((id) => (
          <li key={`r-${id}`} className="status-rejected">
            <span className="tag">{t('trade.rejected')}</span> <Who id={id} infos={infos} />
          </li>
        ))}
        {waiting.map((id) => (
          <li key={`w-${id}`} className="status-waiting muted">
            <span className="tag">{t('trade.pending')}</span> <Who id={id} infos={infos} />
          </li>
        ))}
      </ul>
    </div>
  );
}
