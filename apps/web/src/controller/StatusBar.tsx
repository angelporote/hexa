import type { PlayerView } from '@hexa/engine';
import { playerColor } from '@hexa/theme';
import { Countdown } from '../components/Countdown.js';
import { useI18n } from '../i18n/index.js';
import type { PlayerInfo } from '../host/players.js';
import type { TurnClockState } from '../net/connection.js';

/** Cabecera del mando: quién eres, tus puntos y de quién es el turno. */
export function StatusBar({
  view,
  infos,
  myTurn,
  clock = null,
}: {
  view: PlayerView;
  infos: ReadonlyMap<string, PlayerInfo>;
  myTurn: boolean;
  clock?: TurnClockState | null;
}) {
  const { t } = useI18n();
  const you = view.you;
  if (!you) return null;
  const me = infos.get(you.id);
  const swatch = playerColor(me?.color ?? 'c1');
  const turnName = infos.get(view.turn.player)?.name ?? view.turn.player;
  const ended = view.phase.type === 'ended';
  const onClock = clock !== null && !ended;
  const mineOnClock = onClock && clock.actors.includes(you.id);
  const otherName = infos.get(clock?.actors[0] ?? '')?.name ?? clock?.actors[0] ?? '';

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
      {onClock && (
        <Countdown
          endsAt={clock.endsAt}
          className={mineOnClock ? 'status-clock mine' : 'status-clock'}
          label={(seconds) =>
            mineOnClock
              ? t('clock.you', { seconds })
              : t('clock.other', { player: otherName, seconds })
          }
        />
      )}
      <span className="status-points" aria-label={t('ctl.points', { n: you.totalPoints })}>
        {you.totalPoints}
      </span>
    </header>
  );
}
