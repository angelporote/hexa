import { useState } from 'react';
import { RESOURCE_IDS } from '@hexa/engine';
import type { PlayerView, ResourceId } from '@hexa/engine';
import { resourceName } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { findBankTrade, findPlenty, ofType } from './legal.js';
import { ResourceButton } from './ResourceIcon.js';
import { useSender } from './use-send.js';

function ErrorLine({ problem }: { problem: string | null }) {
  return problem ? (
    <p className="error" role="alert">
      {problem}
    </p>
  ) : null;
}

/** Carta de abundancia: se eligen 2 recursos del banco. */
export function PlentyPanel({
  view,
  onCancel,
  onDone,
}: {
  view: PlayerView;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const { send, busy, problem } = useSender();
  const [picked, setPicked] = useState<ResourceId[]>([]);
  const [a, b] = picked;
  const action = a && b ? findPlenty(view.legalActions, a, b) : undefined;
  const possible = (r: ResourceId) =>
    picked.length < 2 &&
    ofType(view.legalActions, 'PLAY_PLENTY').some((x) => x.resources.includes(r));

  return (
    <section className="choose">
      <p className="instruction">{t('ctl.plenty.title')}</p>
      <div className="res-grid">
        {RESOURCE_IDS.map((r) => (
          <ResourceButton
            key={r}
            resource={r}
            disabled={!possible(r)}
            note={picked.includes(r) ? `×${picked.filter((x) => x === r).length}` : undefined}
            selected={picked.includes(r)}
            onClick={() => setPicked((p) => [...p, r])}
          />
        ))}
      </div>
      <p className="muted">{picked.map((r) => resourceName(locale, r)).join(' + ') || '—'}</p>
      <ErrorLine problem={problem} />
      <div className="panel-actions">
        <button
          type="button"
          className="btn"
          onClick={() => (picked.length > 0 ? setPicked([]) : onCancel())}
        >
          {picked.length > 0 ? t('ctl.reset') : t('ctl.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!action || busy}
          onClick={() => action && void send(action).then((ok) => ok && onDone())}
        >
          {t('ctl.confirm')}
        </button>
      </div>
    </section>
  );
}

/** Carta de monopolio: se elige el recurso a acaparar. */
export function MonopolyPanel({
  view,
  onCancel,
  onDone,
}: {
  view: PlayerView;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { send, busy, problem } = useSender();
  const [picked, setPicked] = useState<ResourceId | null>(null);
  const action = ofType(view.legalActions, 'PLAY_MONOPOLY').find((a) => a.resource === picked);

  return (
    <section className="choose">
      <p className="instruction">{t('ctl.monopoly.title')}</p>
      <div className="res-grid">
        {RESOURCE_IDS.map((r) => (
          <ResourceButton
            key={r}
            resource={r}
            selected={picked === r}
            onClick={() => setPicked(r)}
          />
        ))}
      </div>
      <ErrorLine problem={problem} />
      <div className="panel-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('ctl.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!action || busy}
          onClick={() => action && void send(action).then((ok) => ok && onDone())}
        >
          {t('ctl.confirm')}
        </button>
      </div>
    </section>
  );
}

/** Comercio con el banco: se elige qué entregar (con la tarifa de tus puertos) y qué recibir. */
export function BankPanel({
  view,
  onCancel,
  onDone,
}: {
  view: PlayerView;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const { send, busy, problem } = useSender();
  const [give, setGive] = useState<ResourceId | null>(null);
  const [want, setWant] = useState<ResourceId | null>(null);
  const you = view.you;
  if (!you) return null;

  const canGive = (r: ResourceId) =>
    ofType(view.legalActions, 'BANK_TRADE').some((a) => a.give === r);
  const action = give && want ? findBankTrade(view.legalActions, give, want) : undefined;

  return (
    <section className="choose">
      {give === null ? (
        <>
          <p className="instruction">{t('ctl.bank.give')}</p>
          <div className="res-grid">
            {RESOURCE_IDS.map((r) => (
              <ResourceButton
                key={r}
                resource={r}
                note={t('ctl.bank.ratio', { n: you.tradeRatios[r] })}
                disabled={!canGive(r)}
                onClick={() => setGive(r)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="instruction">{t('ctl.bank.want')}</p>
          <div className="res-grid">
            {RESOURCE_IDS.map((r) => (
              <ResourceButton
                key={r}
                resource={r}
                selected={want === r}
                disabled={!findBankTrade(view.legalActions, give, r)}
                onClick={() => setWant(r)}
              />
            ))}
          </div>
          {want && (
            <p className="summary">
              {t('ctl.bank.summary', {
                count: you.tradeRatios[give],
                give: resourceName(locale, give),
                want: resourceName(locale, want),
              })}
            </p>
          )}
        </>
      )}
      <ErrorLine problem={problem} />
      <div className="panel-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (give === null) onCancel();
            else {
              setGive(null);
              setWant(null);
            }
          }}
        >
          {give === null ? t('ctl.cancel') : t('ctl.back')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!action || busy}
          onClick={() => action && void send(action).then((ok) => ok && onDone())}
        >
          {t('ctl.confirm')}
        </button>
      </div>
    </section>
  );
}
