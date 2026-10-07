import { useEffect, useMemo, useState } from 'react';
import type { PlayerView } from '@hexa/engine';
import { useI18n } from '../i18n/index.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { phaseText } from '../host/phase-text.js';
import { nameOf, playerInfos } from '../host/players.js';
import { ActionPanel } from './ActionPanel.js';
import type { HomeChoice } from './ActionPanel.js';
import { BankPanel, MonopolyPanel, PlentyPanel } from './ChoosePanels.js';
import { CostsSheet } from './CostsSheet.js';
import { DiscardPanel } from './DiscardPanel.js';
import { Hand } from './Hand.js';
import { forcedMode, isMyTurn } from './legal.js';
import { PlacementPanel } from './PlacementPanel.js';
import { StatusBar } from './StatusBar.js';
import { useTurnVibration, useWakeLock } from './hooks.js';

/** Mando del jugador durante la partida: mano privada, botones legales y colocación en el tablero. */
export function Controller({ view, snapshot }: { view: PlayerView; snapshot: ConnectionSnapshot }) {
  const { t } = useI18n();
  const infos = useMemo(() => playerInfos(snapshot.room, view), [snapshot.room, view]);
  const [choice, setChoice] = useState<HomeChoice | null>(null);

  const you = view.you;
  const myTurn = isMyTurn(view);
  const forced = forcedMode(view);
  const ended = view.phase.type === 'ended';

  useWakeLock(!ended);
  useTurnVibration(myTurn && !ended);

  // Al cambiar de fase o de turno, se vuelve a la pantalla principal del mando.
  const situation = `${view.turn.player}:${view.phase.type}`;
  useEffect(() => setChoice(null), [situation]);

  if (!you) return null;
  const name = (id: string) => nameOf(infos, id);
  const close = () => setChoice(null);

  let panel;
  if (ended) {
    panel = (
      <p className="instruction ended">
        {view.winner === you.id
          ? t('ctl.ended.win')
          : t('ctl.ended.lose', { player: name(view.winner ?? '') })}
      </p>
    );
  } else if (forced?.kind === 'discard') {
    panel = <DiscardPanel view={view} owed={forced.owed} />;
  } else if (forced?.kind === 'settlement') {
    panel = <PlacementPanel view={view} kind="settlement" infos={infos} />;
  } else if (forced?.kind === 'road') {
    panel = <PlacementPanel view={view} kind="road" infos={infos} remaining={forced.remaining} />;
  } else if (forced?.kind === 'robber') {
    panel = <PlacementPanel view={view} kind="robber" infos={infos} />;
  } else if (!myTurn) {
    panel = <p className="instruction waiting">{phaseText(view, name, t)}</p>;
  } else if (choice === 'road' || choice === 'settlement' || choice === 'city') {
    panel = (
      <PlacementPanel view={view} kind={choice} infos={infos} onCancel={close} onDone={close} />
    );
  } else if (choice === 'bank') {
    panel = <BankPanel view={view} onCancel={close} onDone={close} />;
  } else if (choice === 'plenty') {
    panel = <PlentyPanel view={view} onCancel={close} onDone={close} />;
  } else if (choice === 'monopoly') {
    panel = <MonopolyPanel view={view} onCancel={close} onDone={close} />;
  } else {
    panel = <ActionPanel view={view} onChoose={setChoice} />;
  }

  return (
    <div className="controller">
      <StatusBar view={view} infos={infos} myTurn={myTurn} />
      <main className="controller-main">{panel}</main>
      <Hand you={you} />
      <CostsSheet />
    </div>
  );
}
