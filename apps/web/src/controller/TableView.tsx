import type { PlayerView } from '@hexa/engine';
import { useI18n } from '../i18n/index.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Dice } from '../host/Dice.js';
import { EventLog } from '../host/EventLog.js';
import { PlayersPanel } from '../host/PlayersPanel.js';
import { colorOf, nameOf } from '../host/players.js';
import type { PlayerInfo } from '../host/players.js';
import { useRollHighlight } from '../board/use-roll-highlight.js';
import { ZoomableBoard } from './ZoomableBoard.js';

/** El tablero de solo lectura con la última tirada, para quien juega desde su propio dispositivo. */
export function TableBoard({
  view,
  snapshot,
  infos,
}: {
  view: PlayerView;
  snapshot: ConnectionSnapshot;
  infos: ReadonlyMap<string, PlayerInfo>;
}) {
  const { t, locale } = useI18n();
  const highlight = useRollHighlight(snapshot.diceRoll);
  const roll =
    snapshot.diceRoll ?? (view.turn.lastRoll ? { dice: view.turn.lastRoll, key: 0 } : null);
  return (
    <section className="table-board">
      {roll && (
        <div className="table-dice">
          <Dice
            dice={roll.dice}
            rollKey={roll.key}
            label={t('game.lastRoll', { total: roll.dice[0] + roll.dice[1] })}
          />
        </div>
      )}
      <ZoomableBoard
        board={view.board}
        buildings={view.buildings}
        roads={view.roads}
        robber={view.robber}
        colorOf={(id) => colorOf(infos, id)}
        locale={locale}
        label={t('app.name')}
        highlight={highlight}
        preview={
          snapshot.preview
            ? {
                target: snapshot.preview.target,
                color: colorOf(infos, snapshot.preview.playerId),
              }
            : null
        }
      />
    </section>
  );
}

/** Pestaña «Tablero» del mando: el tablero, quién va cómo y lo que ha ocurrido. */
export function TableView({
  view,
  snapshot,
  infos,
}: {
  view: PlayerView;
  snapshot: ConnectionSnapshot;
  infos: ReadonlyMap<string, PlayerInfo>;
}) {
  return (
    <div className="table-view">
      <TableBoard view={view} snapshot={snapshot} infos={infos} />
      <PlayersPanel view={view} infos={infos} clock={snapshot.clock} />
      <EventLog events={snapshot.events} nameOf={(id) => nameOf(infos, id)} />
    </div>
  );
}
