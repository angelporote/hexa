import { useState } from 'react';
import { RESOURCE_IDS } from '@hexa/engine';
import type { PlayerView, ResourceCounts, ResourceId, TradeOffer } from '@hexa/engine';
import { playerColor, resourceName } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';
import { ResourceIcon } from './ResourceIcon.js';
import { useSender } from './use-send.js';

const MAX_WANTED = 9;
const zero = (): Record<ResourceId, number> => ({ r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 });
const total = (c: ResourceCounts) => RESOURCE_IDS.reduce((n, r) => n + c[r], 0);

function Steppers({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: ResourceCounts;
  /** Tope por recurso (lo que tienes, al dar; un máximo razonable, al pedir). */
  max: (r: ResourceId) => number;
  onChange: (r: ResourceId, delta: number) => void;
}) {
  const { locale } = useI18n();
  return (
    <fieldset className="trade-side">
      <legend>{label}</legend>
      <ul className="steppers">
        {RESOURCE_IDS.map((r) => (
          <li key={r} className={max(r) === 0 && value[r] === 0 ? 'empty' : undefined}>
            <ResourceIcon resource={r} size={26} />
            <span className="name">{resourceName(locale, r)}</span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={`${label}: − ${resourceName(locale, r)}`}
              disabled={value[r] === 0}
              onClick={() => onChange(r, -1)}
            >
              −
            </button>
            <span className="count" aria-live="polite">
              {value[r]}
            </span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={`${label}: + ${resourceName(locale, r)}`}
              disabled={value[r] >= max(r)}
              onClick={() => onChange(r, 1)}
            >
              +
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * Formulario para proponer un intercambio (a todos o a jugadores concretos) o para responder a
 * una oferta con otras condiciones. Solo comprueba lo evidente (algo en cada lado, y lo que se da
 * debe estar en tu mano); el resto de las reglas las decide el servidor.
 */
export function TradeComposer({
  view,
  infos,
  counterTo,
  onCancel,
  onDone,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
  /** Si se indica, es una contraoferta a esa oferta; si no, una oferta nueva. */
  counterTo?: TradeOffer;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { send, busy, problem } = useSender();
  const you = view.you;

  // Una contraoferta parte de las condiciones originales, vistas desde tu lado.
  const clip = (counts: ResourceCounts): Record<ResourceId, number> => {
    const out = zero();
    for (const r of RESOURCE_IDS) out[r] = Math.min(counts[r], you?.hand[r] ?? 0);
    return out;
  };
  const [give, setGive] = useState<Record<ResourceId, number>>(() =>
    counterTo ? clip(counterTo.want) : zero(),
  );
  const [want, setWant] = useState<Record<ResourceId, number>>(() =>
    counterTo ? { ...counterTo.give } : zero(),
  );
  const others = view.players.filter((p) => p.id !== you?.id);
  const [recipients, setRecipients] = useState<ReadonlySet<string>>(new Set());

  if (!you) return null;
  const everyone = recipients.size === 0 || recipients.size === others.length;
  const ready = total(give) > 0 && total(want) > 0;

  const step =
    (set: typeof setGive, limit: (r: ResourceId) => number) => (r: ResourceId, delta: number) =>
      set((c) => ({ ...c, [r]: Math.max(0, Math.min(limit(r), c[r] + delta)) }));

  const submit = async () => {
    const ok = counterTo
      ? await send({ type: 'COUNTER_TRADE', offerId: counterTo.id, give, want })
      : await send({
          type: 'OFFER_TRADE',
          to: everyone ? null : [...recipients],
          give,
          want,
        });
    if (ok) onDone();
  };

  return (
    <section className="trade-composer">
      <p className="instruction">{counterTo ? t('trade.counter.title') : t('trade.offer.title')}</p>

      <Steppers
        label={t('trade.give')}
        value={give}
        max={(r) => you.hand[r]}
        onChange={step(setGive, (r) => you.hand[r])}
      />
      <Steppers
        label={t('trade.want')}
        value={want}
        max={() => MAX_WANTED}
        onChange={step(setWant, () => MAX_WANTED)}
      />

      {!counterTo && (
        <fieldset className="trade-recipients">
          <legend>{t('trade.to')}</legend>
          <button
            type="button"
            className={everyone ? 'btn selected' : 'btn'}
            aria-pressed={everyone}
            onClick={() => setRecipients(new Set())}
          >
            {t('trade.toAll')}
          </button>
          {others.map((p) => {
            const info = infos.get(p.id);
            const swatch = playerColor(info?.color ?? 'c1');
            const on = recipients.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={on ? 'btn selected' : 'btn'}
                aria-pressed={on}
                onClick={() =>
                  setRecipients((current) => {
                    const next = new Set(current);
                    if (on) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }
              >
                <span
                  className="swatch"
                  style={{ background: swatch.fill, borderColor: swatch.stroke }}
                />
                {info?.name ?? p.id}
              </button>
            );
          })}
        </fieldset>
      )}

      {!ready && <p className="muted">{t('trade.empty')}</p>}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="panel-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('ctl.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {counterTo ? t('trade.sendCounter') : t('trade.send')}
        </button>
      </div>
    </section>
  );
}
