import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/index.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { GameScreen } from '../host/GameScreen.js';
import { LanguageSwitch } from '../components/LanguageSwitch.js';
import { Lobby } from '../host/Lobby.js';
import { useConnection, useSnapshot } from '../net/provider.js';

/** Pantalla principal (`/host`): crea la sala, muestra el lobby y después la partida. */
export function HostPage() {
  const connection = useConnection();
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const creating = useRef(false);

  useEffect(() => {
    connection.start('host');
    return () => {
      creating.current = false;
      connection.stop();
    };
  }, [connection]);

  // Cuando la conexión está lista y no hay sesión que recuperar, se crea una sala nueva.
  const { status, resuming, session, replaced } = snapshot;
  useEffect(() => {
    if (status !== 'connected' || resuming || session !== null || replaced || creating.current) {
      return;
    }
    creating.current = true;
    void connection.createRoom().finally(() => {
      creating.current = false;
    });
  }, [status, resuming, session, replaced, connection]);

  const { room, view } = snapshot;
  const inGame = room !== null && room.status !== 'lobby' && view !== null;

  return (
    <div className={inGame ? 'host in-game' : 'host'}>
      <ConnectionBanner snapshot={snapshot} />
      {!inGame && (
        <header className="host-header">
          <h1 className="brand">{t('app.name')}</h1>
          <LanguageSwitch />
        </header>
      )}
      {room === null && <p className="center muted">{t('common.loading')}</p>}
      {room !== null && room.status === 'lobby' && <Lobby room={room} />}
      {inGame && <GameScreen view={view} snapshot={snapshot} />}
      {room !== null && room.status !== 'lobby' && view === null && (
        <p className="center muted">{t('common.loading')}</p>
      )}
    </div>
  );
}
