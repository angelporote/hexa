import { useMemo } from 'react';
import { RESOURCE_IDS } from '@hexa/engine';
import type { PlayerView } from '@hexa/engine';
import { glyphs, playerColor, resourceName, terrainColors } from '@hexa/theme';
import { Board } from '../board/Board.js';
import { useI18n } from '../i18n/index.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { Dice } from './Dice.js';
import { EventLog } from './EventLog.js';
import { PlayersPanel } from './PlayersPanel.js';
import { colorOf, nameOf, playerInfos } from './players.js';
import { phaseText } from './phase-text.js';

/** Pantalla de partida del host: tablero a la izquierda; jugadores y registro a la derecha. */
export function GameScreen({ view, snapshot }: { view: PlayerView; snapshot: ConnectionSnapshot }) {
  const { t, locale } = useI18n();
  const infos = useMemo(() => playerInfos(snapshot.room, view), [snapshot.room, view]);
  const name = (id: string) => nameOf(infos, id);
  const winner = view.winner;
  const turnSwatch = playerColor(colorOf(infos, view.turn.player));
  const roll =
    snapshot.diceRoll ?? (view.turn.lastRoll ? { dice: view.turn.lastRoll, key: 0 } : null);

  return (
    <div className="game">
      <header className="topbar">
        <div className="turn-banner" style={{ borderColor: turnSwatch.fill }}>
          <span
            className="swatch"
            style={{ background: turnSwatch.fill, borderColor: turnSwatch.stroke }}
          />
          <div>
            <strong>
              {view.phase.type === 'ended'
                ? t('phase.ended')
                : t('game.turnOf', { player: name(view.turn.player) })}
            </strong>
            <span className="phase-text">{phaseText(view, name, t)}</span>
          </div>
        </div>
        {roll && (
          <Dice
            dice={roll.dice}
            rollKey={roll.key}
            label={t('game.lastRoll', { total: roll.dice[0] + roll.dice[1] })}
          />
        )}
        <div className="bank" aria-label={t('game.bank')}>
          {RESOURCE_IDS.map((r) => (
            <span
              className="bank-item"
              key={r}
              title={`${resourceName(locale, r)}: ${view.bank[r]}`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d={glyphs[r]}
                  fill={terrainColors[r].fill}
                  stroke={terrainColors[r].stroke}
                  strokeWidth="1.2"
                />
              </svg>
              {view.bank[r]}
            </span>
          ))}
          <span className="bank-item muted">{t('game.deck', { n: view.deckSize })}</span>
        </div>
        <span className="round">{t('game.round', { n: view.turn.number })}</span>
      </header>

      <main className="board-area">
        <Board
          board={view.board}
          buildings={view.buildings}
          roads={view.roads}
          robber={view.robber}
          colorOf={(id) => colorOf(infos, id)}
          locale={locale}
          label={t('app.name')}
        />
      </main>

      <aside className="sidebar">
        <PlayersPanel view={view} infos={infos} />
        <EventLog events={snapshot.events} nameOf={name} />
      </aside>

      {winner !== null && (
        <div className="winner" role="dialog" aria-modal="true">
          <div className="winner-card">
            <h1>{t('win.title', { player: name(winner) })}</h1>
            <p>
              {t('win.points', {
                n: view.players.find((p) => p.id === winner)?.points ?? view.rules.victoryPoints,
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
