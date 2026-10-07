import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ROOM_CODE_LENGTH } from '@hexa/protocol';
import type { FormEvent } from 'react';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { LanguageSwitch } from '../components/LanguageSwitch.js';
import { GameScreen } from '../host/GameScreen.js';
import { useI18n } from '../i18n/index.js';
import { useConnection, useSnapshot } from '../net/provider.js';
import { cleanCode } from './clean-code.js';

/** `/watch`: pedir el código de la partida que se quiere mirar. */
export function WatchEntryPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === ROOM_CODE_LENGTH) navigate(`/watch/${code}`);
  };
  return (
    <main className="join">
      <div className="join-top">
        <LanguageSwitch />
      </div>
      <h1 className="brand">{t('watch.title')}</h1>
      <p className="lead">{t('watch.help')}</p>
      <form className="join-form" onSubmit={submit} noValidate>
        <label>
          <span>{t('join.code')}</span>
          <input
            className="input input-code"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABCD"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={code.length !== ROOM_CODE_LENGTH}
        >
          {t('watch.submit')}
        </button>
      </form>
      <Link className="link-btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}

/**
 * `/watch/:code`: ver una partida como espectador. Solo se recibe información pública (nunca las
 * manos) y no se puede actuar. Sirve también como pantalla compartida de una sala a distancia.
 */
export function WatchPage() {
  const { t, error } = useI18n();
  const connection = useConnection();
  const snapshot = useSnapshot();
  const code = (useParams()['code'] ?? '').toUpperCase();
  const [problem, setProblem] = useState<string | null>(null);
  const joining = useRef(false);

  useEffect(() => {
    connection.start('spectator');
    return () => {
      joining.current = false;
      connection.stop();
    };
  }, [connection]);

  const { status, resuming, session } = snapshot;
  useEffect(() => {
    if (status !== 'connected' || resuming || joining.current) return;
    if (session?.code === code && session.role === 'spectator') return;
    joining.current = true;
    void connection.watch(code).then((ack) => {
      joining.current = false;
      if (!ack.ok) setProblem(error(ack.error));
    });
  }, [status, resuming, session, code, connection, error]);

  const { room, view } = snapshot;
  if (problem) {
    return (
      <main className="join">
        <h1 className="brand">{t('watch.title')}</h1>
        <p className="error" role="alert">
          {problem}
        </p>
        <Link className="btn" to="/watch">
          {t('common.back')}
        </Link>
      </main>
    );
  }

  return (
    <div className="watch">
      <ConnectionBanner snapshot={snapshot} />
      {room === null && <p className="center muted">{t('common.loading')}</p>}
      {room !== null && room.status === 'lobby' && (
        <main className="join">
          <p className="eyebrow">{t('lobby.code')}</p>
          <p className="room-code">{room.code}</p>
          <p className="lead">{t('watch.waiting')}</p>
          <ul className="seat-list">
            {room.seats.map((seat) => (
              <li key={seat.playerId} className="seat">
                <span className="seat-name">{seat.name}</span>
                {seat.bot && <span className="tag">{t('lobby.bot')}</span>}
                <span className={seat.ready ? 'tag tag-ok' : 'tag'}>
                  {seat.ready ? t('lobby.ready') : t('lobby.notReady')}
                </span>
              </li>
            ))}
          </ul>
        </main>
      )}
      {room !== null && room.status !== 'lobby' && view !== null && (
        <GameScreen view={view} snapshot={snapshot} />
      )}
      {room !== null && room.status !== 'lobby' && view === null && (
        <p className="center muted">{t('common.loading')}</p>
      )}
    </div>
  );
}
