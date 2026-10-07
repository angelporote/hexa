import type { PlayerView } from '@hexa/engine';
import { playerColor } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';

/** Cabecera del mando: quién eres, tus puntos y de quién es el turno. */
export function StatusBar({
  view,
  infos,
  myTurn,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
  myTurn: boolean;
}) {
  const { t } = useI18n();
  const you = view.you;
  if (!you) return null;
  const me = infos.get(you.id);
  const swatch = playerColor(me?.color ?? 'c1');
  const turnName = infos.get(view.turn.player)?.name ?? view.turn.player;
  const ended = view.phase.type === 'ended';

  return (
    <header
      className={myTurn && !ended ? 'status my-turn' : 'status'}
      style={{ borderColor: swatch.fill }}
    >
      <span className="swatch" style={{ background: swatch.fill, borderColor: swatch.stroke }} />
      <div className="status-text">
        <strong>{me?.name ?? you.id}</strong>
        <span>
          {ended
            ? t('phase.ended')
            : myTurn
              ? t('ctl.yourTurn')
              : t('game.turnOf', { player: turnName })}
        </span>
      </div>
      <span className="status-points" aria-label={t('ctl.points', { n: you.totalPoints })}>
        {you.totalPoints}
      </span>
    </header>
  );
}
