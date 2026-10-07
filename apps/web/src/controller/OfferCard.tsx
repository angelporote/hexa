import type { PlayerView } from '@hexa/engine';
import { OfferSummary } from '../components/OfferSummary.js';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';
import { ofType } from './legal.js';
import { useSender } from './use-send.js';

/**
 * La oferta de comercio abierta, vista desde el mando. Los botones salen de `legalActions`:
 * el destinatario responde (aceptar, rechazar, contraofertar) y el oferente cierra el trato con
 * quien aceptó, acepta una contraoferta o cancela.
 */
export function OfferCard({
  view,
  infos,
  onCounter,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
  onCounter: () => void;
}) {
  const { t } = useI18n();
  const { send, busy, problem } = useSender();
  const offer = view.pendingTrade;
  const me = view.you?.id;
  if (!offer || !me) return null;

  const legal = view.legalActions;
  const mine = offer.from === me;
  const accept = ofType(legal, 'ACCEPT_TRADE')[0];
  const reject = ofType(legal, 'REJECT_TRADE')[0];
  const cancel = ofType(legal, 'CANCEL_TRADE')[0];
  const confirms = ofType(legal, 'CONFIRM_TRADE');
  const counterConfirms = ofType(legal, 'CONFIRM_COUNTER');
  // Destinatario: lo dice la propia oferta (pública), no que aún pueda responder.
  const isRecipient = !mine && (offer.to === null || offer.to.includes(me));
  const myAnswer = offer.accepted.includes(me)
    ? 'accepted'
    : offer.rejected.includes(me)
      ? 'rejected'
      : offer.counters.some((c) => c.from === me)
        ? 'countered'
        : null;

  return (
    <section className="offer-card" aria-label={t('trade.title')}>
      <h2>{mine ? t('trade.yourOffer') : t('trade.title')}</h2>
      <OfferSummary
        offer={offer}
        playerIds={view.players.map((p) => p.id)}
        infos={infos}
        acceptedAction={
          mine
            ? (id) => (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !confirms.some((a) => a.with === id)}
                  onClick={() => void send({ type: 'CONFIRM_TRADE', offerId: offer.id, with: id })}
                >
                  {t('trade.close', { player: infos.get(id)?.name ?? id })}
                </button>
              )
            : undefined
        }
        counterAction={
          mine
            ? (c) => (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !counterConfirms.some((a) => a.with === c.from)}
                  onClick={() =>
                    void send({ type: 'CONFIRM_COUNTER', offerId: offer.id, with: c.from })
                  }
                >
                  {t('trade.acceptCounter', { player: infos.get(c.from)?.name ?? c.from })}
                </button>
              )
            : undefined
        }
      />

      {isRecipient && (
        <div className="offer-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !accept || myAnswer === 'accepted'}
            onClick={() => accept && void send(accept)}
          >
            {t('trade.accept')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || myAnswer === 'rejected'}
            onClick={() => reject && void send(reject)}
          >
            {t('trade.reject')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !view.canCounterTrade}
            onClick={onCounter}
          >
            {t('trade.counter')}
          </button>
          {accept === undefined && myAnswer === null && (
            <p className="muted full">{t('trade.cannotAccept')}</p>
          )}
        </div>
      )}
      {isRecipient && myAnswer !== null && <p className="muted">{t(`trade.you.${myAnswer}`)}</p>}
      {mine && (
        <div className="offer-actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !cancel}
            onClick={() => cancel && void send(cancel)}
          >
            {t('trade.cancel')}
          </button>
          {offer.accepted.length === 0 && offer.counters.length === 0 && (
            <p className="muted full">{t('trade.waiting')}</p>
          )}
        </div>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
