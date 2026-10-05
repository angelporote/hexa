import { useMemo, useState } from 'react';
import { MIN_PLAYERS_TO_START } from '@hexa/protocol';
import type { RoomState } from '@hexa/protocol';
import { playerColor } from '@hexa/theme';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';
import { QrCode } from './QrCode.js';

type AckLike = { ok: boolean; error?: string };

/** Lobby de la pantalla principal: código grande, QR y jugadores conectados. */
export function Lobby({ room }: { room: RoomState }) {
  const { t, error } = useI18n();
  const connection = useConnection();
  const [problem, setProblem] = useState<string | null>(null);

  const joinUrl = useMemo(() => `${window.location.origin}/join?code=${room.code}`, [room.code]);
  const seats = room.seats;
  const everyoneReady = seats.length > 0 && seats.every((s) => s.ready);
  const canStart = seats.length >= MIN_PLAYERS_TO_START && everyoneReady;
  const hint =
    seats.length < MIN_PLAYERS_TO_START
      ? t('lobby.needPlayers', { min: MIN_PLAYERS_TO_START })
      : everyoneReady
        ? null
        : t('lobby.needReady');

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

        <div className="lobby-actions">
          <button
            type="button"
            className="btn"
            disabled={seats.length >= 4}
            onClick={() => void run(() => connection.request('lobby:addBot'))}
          >
            {t('lobby.addBot')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canStart}
            onClick={() => void run(() => connection.request('lobby:start'))}
          >
            {t('lobby.start')}
          </button>
        </div>
        {(problem ?? hint) && (
          <p className={problem ? 'error' : 'muted'} role={problem ? 'alert' : undefined}>
            {problem ?? hint}
          </p>
        )}
      </section>
    </div>
  );
}
