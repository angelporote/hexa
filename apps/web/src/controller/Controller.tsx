import { useEffect, useMemo, useState } from 'react';
import type { PlayerView } from '@hexa/engine';
import { useI18n } from '../i18n/index.js';
import type { ConnectionSnapshot } from '../net/connection.js';
import { phaseText } from '../host/phase-text.js';
import { EventLog } from '../host/EventLog.js';
import { PlayersPanel } from '../host/PlayersPanel.js';
import { nameOf, playerInfos } from '../host/players.js';
import { ActionPanel } from './ActionPanel.js';
import type { HomeChoice } from './ActionPanel.js';
import { BankPanel, MonopolyPanel, PlentyPanel } from './ChoosePanels.js';
import { CostsSheet } from './CostsSheet.js';
import { DiscardPanel } from './DiscardPanel.js';
import { Hand } from './Hand.js';
import { forcedMode, isMyTurn } from './legal.js';
import { OfferCard } from './OfferCard.js';
import { PlacementPanel } from './PlacementPanel.js';
import { TradeComposer } from './TradeComposer.js';
import { StatusBar } from './StatusBar.js';
import { SubstituteBanner } from './SubstituteBanner.js';
import { TableBoard, TableView } from './TableView.js';
import { WIDE_QUERY, useMediaQuery } from './use-media-query.js';
import { useTurnVibration, useWakeLock } from './hooks.js';
import { useSoundEffects } from '../sound/use-sound-effects.js';

/** Mando del jugador durante la partida: mano privada, botones legales y colocación en el tablero. */
export function Controller({ view, snapshot }: { view: PlayerView; snapshot: ConnectionSnapshot }) {
  const { t } = useI18n();
  const infos = useMemo(() => playerInfos(snapshot.room, view), [snapshot.room, view]);
  const [choice, setChoice] = useState<HomeChoice | null>(null);
  const [tab, setTab] = useState<'play' | 'board'>('play');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const wide = useMediaQuery(WIDE_QUERY);

  const you = view.you;
  const myTurn = isMyTurn(view);
  const forced = forcedMode(view);
  const ended = view.phase.type === 'ended';

  // Algo que requiere tu atención: tu turno, una elección obligatoria o una oferta dirigida a ti.
  const offer = view.pendingTrade;
  const offerForMe =
    !!offer && !!you && offer.from !== you.id && (offer.to === null || offer.to.includes(you.id));
  const attention = !ended && (myTurn || forced !== null || offerForMe);
  useEffect(() => {
    if (attention) setTab('play');
  }, [attention]);

  useWakeLock(!ended);
  useTurnVibration(myTurn && !ended);
  // Sin pantalla común (sala a distancia) también suenan los dados, las construcciones y el ladrón.
  useSoundEffects(snapshot.events, you?.id ?? null, snapshot.room?.hostless ? 'all' : 'personal');

  // Al cambiar de fase o de turno, se vuelve a la pantalla principal del mando.
  const situation = `${view.turn.player}:${view.phase.type}`;
  useEffect(() => setChoice(null), [situation]);
  // Si la oferta se cierra mientras se redacta una contraoferta, se vuelve al inicio.
  const openOfferId = view.pendingTrade?.id ?? null;
  useEffect(() => {
    if (openOfferId === null) setChoice((c) => (c === 'counter' ? null : c));
  }, [openOfferId]);

  if (!you) return null;
  const name = (id: string) => nameOf(infos, id);
  const close = () => setChoice(null);

  // En pantalla ancha el tablero de la colocación se dibuja en el hueco de la izquierda.
  const boardSlot = wide ? slot : undefined;
  const placing =
    !ended &&
    (forced?.kind === 'settlement' ||
      forced?.kind === 'road' ||
      forced?.kind === 'robber' ||
      (myTurn &&
        forced === null &&
        (choice === 'road' || choice === 'settlement' || choice === 'city')));

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
    panel = <PlacementPanel boardSlot={boardSlot} view={view} kind="settlement" infos={infos} />;
  } else if (forced?.kind === 'road') {
    panel = (
      <PlacementPanel
        boardSlot={boardSlot}
        view={view}
        kind="road"
        infos={infos}
        remaining={forced.remaining}
      />
    );
  } else if (forced?.kind === 'robber') {
    panel = <PlacementPanel boardSlot={boardSlot} view={view} kind="robber" infos={infos} />;
  } else if (!myTurn) {
    panel =
      choice === 'counter' && view.pendingTrade ? (
        <TradeComposer
          view={view}
          infos={infos}
          counterTo={view.pendingTrade}
          onCancel={close}
          onDone={close}
        />
      ) : (
        <>
          {view.pendingTrade && (
            <OfferCard view={view} infos={infos} onCounter={() => setChoice('counter')} />
          )}
          <p className="instruction waiting">{phaseText(view, name, t)}</p>
        </>
      );
  } else if (choice === 'road' || choice === 'settlement' || choice === 'city') {
    panel = (
      <PlacementPanel
        boardSlot={boardSlot}
        view={view}
        kind={choice}
        infos={infos}
        onCancel={close}
        onDone={close}
      />
    );
  } else if (choice === 'bank') {
    panel = <BankPanel view={view} onCancel={close} onDone={close} />;
  } else if (choice === 'trade') {
    panel = <TradeComposer view={view} infos={infos} onCancel={close} onDone={close} />;
  } else if (choice === 'plenty') {
    panel = <PlentyPanel view={view} onCancel={close} onDone={close} />;
  } else if (choice === 'monopoly') {
    panel = <MonopolyPanel view={view} onCancel={close} onDone={close} />;
  } else {
    panel = (
      <>
        {view.pendingTrade && (
          <OfferCard view={view} infos={infos} onCounter={() => setChoice('counter')} />
        )}
        <ActionPanel view={view} onChoose={setChoice} />
      </>
    );
  }

  const status = (
    <>
      <StatusBar view={view} infos={infos} myTurn={myTurn} clock={snapshot.clock} />
      {infos.get(you.id)?.auto === true && <SubstituteBanner />}
    </>
  );
  const body = (
    <>
      <main className="controller-main">{panel}</main>
      <Hand you={you} />
      <CostsSheet />
    </>
  );

  if (wide) {
    return (
      <div className="controller controller-wide">
        <section className="pane-board">
          {placing ? (
            <div ref={setSlot} className="board-slot" />
          ) : (
            <TableBoard view={view} snapshot={snapshot} infos={infos} />
          )}
        </section>
        <aside className="pane-side">
          {status}
          {body}
          <PlayersPanel view={view} infos={infos} clock={snapshot.clock} />
          <EventLog events={snapshot.events} nameOf={name} />
        </aside>
      </div>
    );
  }

  return (
    <div className="controller">
      {status}
      <div className="tabs" role="tablist" aria-label={t('ctl.tabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'play'}
          className={tab === 'play' ? 'tab active' : 'tab'}
          onClick={() => setTab('play')}
        >
          {t('ctl.tab.play')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'board'}
          className={tab === 'board' ? 'tab active' : 'tab'}
          onClick={() => setTab('board')}
        >
          {t('ctl.tab.board')}
          {attention && tab === 'board' && (
            <span className="dot" aria-label={t('ctl.tab.attention')} />
          )}
        </button>
      </div>
      {tab === 'play' ? body : <TableView view={view} snapshot={snapshot} infos={infos} />}
    </div>
  );
}
