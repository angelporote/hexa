import { useState } from 'react';
import { RESOURCE_IDS } from '@hexa/engine';
import type { PlayerView, ResourceId } from '@hexa/engine';
import { useI18n } from '../i18n/index.js';
import { findDiscard } from './legal.js';
import { ResourceIcon } from './ResourceIcon.js';
import { useSender } from './use-send.js';
import { resourceName } from '@hexa/theme';

/** Descarte tras un 7: se eligen las cartas con contadores y solo se confirma una combinación legal. */
export function DiscardPanel({ view, owed }: { view: PlayerView; owed: number }) {
  const { t, locale } = useI18n();
  const { send, busy, problem } = useSender();
  const you = view.you;
  const [chosen, setChosen] = useState<Record<ResourceId, number>>({
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
  });
  if (!you) return null;

  const total = RESOURCE_IDS.reduce((sum, r) => sum + chosen[r], 0);
  const action = findDiscard(view.legalActions, chosen);
  const change = (r: ResourceId, delta: number) =>
    setChosen((c) => ({ ...c, [r]: Math.max(0, Math.min(you.hand[r], c[r] + delta)) }));

  return (
    <section className="discard">
      <p className="instruction">{t('ctl.discard.title', { n: owed })}</p>
      <ul className="steppers">
        {RESOURCE_IDS.map((r) => (
          <li key={r} className={you.hand[r] === 0 ? 'empty' : undefined}>
            <ResourceIcon resource={r} size={28} />
            <span className="name">{resourceName(locale, r)}</span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={`− ${resourceName(locale, r)}`}
              disabled={chosen[r] === 0}
              onClick={() => change(r, -1)}
            >
              −
            </button>
            <span className="count" aria-live="polite">
              {chosen[r]}
              <small>/{you.hand[r]}</small>
            </span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={`+ ${resourceName(locale, r)}`}
              disabled={chosen[r] >= you.hand[r] || total >= owed}
              onClick={() => change(r, 1)}
            >
              +
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">{t('ctl.discard.count', { have: total, owed })}</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!action || busy}
          onClick={() => action && void send(action)}
        >
          {t('ctl.confirm')}
        </button>
      </div>
    </section>
  );
}
