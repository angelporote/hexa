import type { PlayerView } from '@hexa/engine';
import { playerColor } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from './players.js';

/** Un jugador por tarjeta: puntos públicos, cartas en mano (solo el número) y bonificaciones. */
export function PlayersPanel({
  view,
  infos,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
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
              <span
                className="swatch"
                style={{ background: swatch.fill, borderColor: swatch.stroke }}
              />
              <span className="player-name">{info?.name ?? p.id}</span>
              {info?.bot && <span className="tag">{t('lobby.bot')}</span>}
              {info?.connected === false && <span className="tag">{t('players.offline')}</span>}
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
