import type { PlayerView } from '@hexa/engine';
import { devCardName } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { has } from './legal.js';
import { useSender } from './use-send.js';

export type HomeChoice = 'road' | 'settlement' | 'city' | 'bank' | 'plenty' | 'monopoly';

/**
 * Botones del turno libre, generados a partir de `legalActions`: solo se pueden pulsar los que el
 * motor aceptaría ahora mismo. Los que abren un selector de sitio o de recursos avisan al padre.
 */
export function ActionPanel({
  view,
  onChoose,
}: {
  view: PlayerView;
  onChoose: (choice: HomeChoice) => void;
}) {
  const { t, locale } = useI18n();
  const { send, busy, problem } = useSender();
  const legal = view.legalActions;
  const rolling = view.phase.type === 'roll';

  const direct = (
    label: string,
    type: 'ROLL' | 'END_TURN' | 'BUY_DEV_CARD' | 'PLAY_ARMY' | 'PLAY_ROADS',
    primary = false,
  ) => (
    <button
      key={type}
      type="button"
      className={primary ? 'btn btn-primary btn-lg' : 'btn btn-lg'}
      disabled={!has(legal, type) || busy}
      onClick={() => void send({ type })}
    >
      {label}
    </button>
  );

  const opener = (label: string, choice: HomeChoice, available: boolean) => (
    <button
      key={choice}
      type="button"
      className="btn btn-lg"
      disabled={!available || busy}
      onClick={() => onChoose(choice)}
    >
      {label}
    </button>
  );

  return (
    <section className="actions">
      {rolling && direct(t('ctl.roll'), 'ROLL', true)}

      {!rolling && (
        <div className="action-grid">
          {opener(t('ctl.buildRoad'), 'road', has(legal, 'BUILD_ROAD'))}
          {opener(t('ctl.buildSettlement'), 'settlement', has(legal, 'BUILD_SETTLEMENT'))}
          {opener(t('ctl.buildCity'), 'city', has(legal, 'BUILD_CITY'))}
          {direct(t('ctl.buyCard'), 'BUY_DEV_CARD')}
          {opener(t('ctl.bankTrade'), 'bank', has(legal, 'BANK_TRADE'))}
        </div>
      )}

      {(has(legal, 'PLAY_ARMY') ||
        has(legal, 'PLAY_ROADS') ||
        has(legal, 'PLAY_PLENTY') ||
        has(legal, 'PLAY_MONOPOLY')) && (
        <div className="card-actions">
          <h3>{t('ctl.playCard')}</h3>
          <div className="action-grid">
            {has(legal, 'PLAY_ARMY') && direct(devCardName(locale, 'army'), 'PLAY_ARMY')}
            {has(legal, 'PLAY_ROADS') && direct(devCardName(locale, 'roads'), 'PLAY_ROADS')}
            {has(legal, 'PLAY_PLENTY') && opener(devCardName(locale, 'plenty'), 'plenty', true)}
            {has(legal, 'PLAY_MONOPOLY') &&
              opener(devCardName(locale, 'monopoly'), 'monopoly', true)}
          </div>
        </div>
      )}

      {!rolling && <div className="end-turn">{direct(t('ctl.endTurn'), 'END_TURN', true)}</div>}

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
