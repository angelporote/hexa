import { useMemo, useState } from 'react';
import type { RoomState } from '@hexa/protocol';
import { playerColor } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';
import { AdminControls } from '../components/AdminControls.js';
import { QrCode } from './QrCode.js';

type AckLike = { ok: boolean; error?: string };

/** Lobby de la pantalla principal: código grande, QR y jugadores conectados. */
export function Lobby({ room }: { room: RoomState }) {
  const { t, error } = useI18n();
  const connection = useConnection();
  const [problem, setProblem] = useState<string | null>(null);

  const joinUrl = useMemo(() => `${window.location.origin}/join?code=${room.code}`, [room.code]);
  const seats = room.seats;

  const run = async (action: () => Promise<AckLike>) => {
    const ack = await action();
    setProblem(ack.ok ? null : error(ack.error ?? 'generic'));
  };

  return (
    <div className="lobby">
      <section className="lobby-join">
        <p className="eyebrow">{t('lobby.code')}</p>
        <p className="room-code" aria-live="polite">
          {room.code}
        </p>
        <QrCode value={joinUrl} label={t('lobby.qrAlt', { code: room.code })} />
        <p className="join-hint">{t('lobby.scan', { url: window.location.host })}</p>
        {room.spectators > 0 && (
          <p className="muted">{t('lobby.spectators', { n: room.spectators })}</p>
        )}
      </section>

      <section className="lobby-players">
        <h2>{t('lobby.players')}</h2>
        {seats.length === 0 && <p className="muted">{t('lobby.empty')}</p>}
        <ul className="seat-list">
          {seats.map((seat) => {
            const swatch = playerColor(seat.color);
            return (
              <li key={seat.playerId} className={seat.connected ? 'seat' : 'seat offline'}>
                <span
                  className="swatch"
                  style={{ background: swatch.fill, borderColor: swatch.stroke }}
                />
                <span className="seat-name">{seat.name}</span>
                {seat.bot && <span className="tag">{t('lobby.bot')}</span>}
                <span className={seat.ready ? 'tag tag-ok' : 'tag'}>
                  {!seat.connected
                    ? t('lobby.disconnected')
                    : seat.ready
                      ? t('lobby.ready')
                      : t('lobby.notReady')}
                </span>
                {seat.bot && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      void run(() =>
                        connection.request('lobby:removeBot', { playerId: seat.playerId }),
                      )
                    }
                  >
                    {t('lobby.removeBot')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <AdminControls room={room} />
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
      </section>
    </div>
  );
}
