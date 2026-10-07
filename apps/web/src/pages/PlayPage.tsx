import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { Controller } from '../controller/Controller.js';
import { PlayLobby } from '../controller/PlayLobby.js';
import { useI18n } from '../i18n/index.js';
import { useConnection, useSnapshot } from '../net/provider.js';

/** Mando móvil (`/play/:code`): lobby de espera y, después, el mando de la partida. */
export function PlayPage() {
  const { t } = useI18n();
  const connection = useConnection();
  const snapshot = useSnapshot();
  const navigate = useNavigate();
  const code = (useParams()['code'] ?? '').toUpperCase();

  useEffect(() => {
    connection.start('player');
    return () => connection.stop();
  }, [connection]);

  // Sin una sesión válida para esta sala, se vuelve al formulario con el código ya escrito.
  const { status, resuming, session } = snapshot;
  useEffect(() => {
    if (status !== 'connected' || resuming) return;
    if (session === null || session.code !== code || session.role !== 'player') {
      navigate(`/join?code=${code}`, { replace: true });
    }
  }, [status, resuming, session, code, navigate]);

  const { room, view } = snapshot;
  const leave = () => {
    void connection.leave().then(() => navigate('/', { replace: true }));
  };

  return (
    <div className="play">
      <ConnectionBanner snapshot={snapshot} />
      {room === null && <p className="center muted">{t('common.loading')}</p>}
      {room !== null && room.status === 'lobby' && <PlayLobby room={room} onLeave={leave} />}
      {room !== null && room.status !== 'lobby' && view !== null && (
        <Controller view={view} snapshot={snapshot} />
      )}
      {room !== null && room.status !== 'lobby' && view === null && (
        <p className="center muted">{t('common.loading')}</p>
      )}
    </div>
  );
}
