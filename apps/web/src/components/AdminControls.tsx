import { useState } from 'react';
import { MIN_PLAYERS_TO_START } from '@hexa/protocol';
import type { RoomState } from '@hexa/protocol';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';

type AckLike = { ok: boolean; error?: string };

/**
 * Botones de quien administra la sala (la pantalla principal o, en una sala a distancia, el
 * jugador que la creó): añadir bots y empezar la partida, con el motivo si todavía no se puede.
 */
export function AdminControls({ room }: { room: RoomState }) {
  const { t, error } = useI18n();
  const connection = useConnection();
  const [problem, setProblem] = useState<string | null>(null);

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
    <>
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
    </>
  );
}
