import { useState } from 'react';
import { MAX_NAME_LENGTH, PLAYER_COLORS } from '@hexa/protocol';
import type { RoomState } from '@hexa/protocol';
import { useI18n } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import { AdminControls } from '../components/AdminControls.js';
import { Swatch } from '../components/Swatch.js';
import { TurnTimerOption } from '../components/TurnTimerOption.js';
import { useConnection } from '../net/provider.js';
import { ShareRoom } from './ShareRoom.js';

const COLOR_LABELS: Record<(typeof PLAYER_COLORS)[number], MessageKey> = {
  c1: 'color.c1',
  c2: 'color.c2',
  c3: 'color.c3',
  c4: 'color.c4',
};

/** Sala de espera del móvil: cambiar nombre y color, marcarse como listo y ver quién hay. */
export function PlayLobby({ room, onLeave }: { room: RoomState; onLeave: () => void }) {
  const { t, error } = useI18n();
  const connection = useConnection();
  const me = room.seats.find((s) => s.playerId === room.you.playerId);
  const [name, setName] = useState(me?.name ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  if (!me) return null;
  const taken = new Set(room.seats.filter((s) => s.playerId !== me.playerId).map((s) => s.color));

  const update = async (patch: Record<string, unknown>) => {
    const ack = await connection.request('lobby:update', patch);
    setProblem(ack.ok ? null : error(ack.error));
  };

  return (
    <div className="play-lobby">
      <h1 className="room-code room-code-sm">{room.code}</h1>
      {room.hostless && <ShareRoom code={room.code} />}

      <label className="field">
        <span>{t('play.lobby.name')}</span>
        <input
          className="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== me.name) void update({ name: trimmed });
            else setName(me.name);
          }}
        />
      </label>

      <fieldset className="color-picker">
        <legend>{t('play.lobby.color')}</legend>
        {PLAYER_COLORS.map((c) => (
          <label key={c} className={me.color === c ? 'color-option selected' : 'color-option'}>
            <input
              type="radio"
              name="color"
              value={c}
              checked={me.color === c}
              disabled={taken.has(c)}
              onChange={() => void update({ color: c })}
            />
            <Swatch color={c} large taken={taken.has(c)} />
            <span className="sr-only">{t(COLOR_LABELS[c])}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className={me.ready ? 'btn btn-lg' : 'btn btn-primary btn-lg'}
        onClick={() => void update({ ready: !me.ready })}
      >
        {me.ready ? t('play.lobby.notReady') : t('play.lobby.ready')}
      </button>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <TurnTimerOption room={room} />
      {room.you.admin && <AdminControls room={room} />}
      <p className="muted">
        {room.hostless ? t('play.lobby.waitingOwner') : t('play.lobby.waiting')}
      </p>

      <h2>{t('play.lobby.others')}</h2>
      <ul className="seat-list">
        {room.seats.map((seat) => {
          return (
            <li key={seat.playerId} className={seat.connected ? 'seat' : 'seat offline'}>
              <Swatch color={seat.color} />
              <span className="seat-name">
                {seat.name}
                {seat.playerId === me.playerId ? ` (${t('ctl.you')})` : ''}
              </span>
              {seat.bot && <span className="tag">{t('lobby.bot')}</span>}
              <span className={seat.ready ? 'tag tag-ok' : 'tag'}>
                {seat.ready ? t('lobby.ready') : t('lobby.notReady')}
              </span>
              {seat.bot && room.you.admin && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    void connection.request('lobby:removeBot', { playerId: seat.playerId })
                  }
                >
                  {t('lobby.removeBot')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="link-btn" onClick={onLeave}>
        {t('play.lobby.leave')}
      </button>
    </div>
  );
}
