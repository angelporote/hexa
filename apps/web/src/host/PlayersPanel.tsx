import type { PlayerView } from '@hexa/engine';
import { playerColor } from '@hexa/theme';
import { Countdown } from '../components/Countdown.js';
import { Swatch } from '../components/Swatch.js';
import { useI18n } from '../i18n/index.js';
import type { TurnClockState } from '../net/connection.js';
import type { PlayerInfo } from './players.js';

/** Un jugador por tarjeta: puntos públicos, cartas en mano (solo el número) y bonificaciones. */
export function PlayersPanel({
  view,
  infos,
  clock = null,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
  /** Temporizador de turno: quien está en juego muestra su cuenta atrás. */
  clock?: TurnClockState | null;
}) {
  const { t } = useI18n();
  const ended = view.phase.type === 'ended';

  return (
    <ul className="players">
      {view.players.map((p) => {
        const info = infos.get(p.id);
        const swatch = playerColor(info?.color ?? 'c1');
        const active = !ended && view.turn.player === p.id;
        const className = [
          'player-card',
          active ? 'active' : '',
          info?.connected === false ? 'offline' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={p.id}
            className={className}
            style={{ borderColor: active ? swatch.fill : undefined }}
            aria-current={active ? 'true' : undefined}
          >
            <div className="player-head">
              <Swatch color={info?.color ?? 'c1'} />
              <span className="player-name">{info?.name ?? p.id}</span>
              {info?.bot && <span className="tag">{t('lobby.bot')}</span>}
              {info?.auto && <span className="tag">{t('players.auto')}</span>}
              {info?.connected === false && <span className="tag">{t('players.offline')}</span>}
              {!ended && clock?.actors.includes(p.id) && (
                <Countdown
                  endsAt={clock.endsAt}
                  className="player-clock"
                  label={(seconds) => t('clock.other', { player: info?.name ?? p.id, seconds })}
                />
              )}
              <span className="player-points" title={t('players.points')}>
                {p.points}
              </span>
            </div>
            <dl className="player-stats">
              <div title={t('players.resources')}>
                <dt>{t('players.resources')}</dt>
                <dd>{p.resourceCount}</dd>
              </div>
              <div title={t('players.cards')}>
                <dt>{t('players.cards')}</dt>
                <dd>{p.devCardCount}</dd>
              </div>
              <div title={t('players.army')}>
                <dt>{t('players.army')}</dt>
                <dd>{p.armiesPlayed}</dd>
              </div>
              <div title={t('players.road')}>
                <dt>{t('players.road')}</dt>
                <dd>{p.longestRoad}</dd>
              </div>
            </dl>
            <div className="awards">
              {view.awards.longestRoad === p.id && (
                <span className="tag tag-award">{t('award.longestRoad')}</span>
              )}
              {view.awards.largestArmy === p.id && (
                <span className="tag tag-award">{t('award.largestArmy')}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
