import { useState } from 'react';
import { TURN_TIMER_CHOICES } from '@hexa/protocol';
import type { RoomState } from '@hexa/protocol';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';

/**
 * Temporizador de turno de la sala. Quien la administra lo elige; los demás solo ven si está
 * activado, porque cambia lo que ocurre si no mueven a tiempo.
 */
export function TurnTimerOption({ room }: { room: RoomState }) {
  const { t, error } = useI18n();
  const connection = useConnection();
  const [problem, setProblem] = useState<string | null>(null);
  const current = room.options.turnTimerSeconds;

  if (!room.you.admin) {
    return current === null ? null : (
      <p className="muted">{t('options.timerOn', { n: current })}</p>
    );
  }

  const choices: number[] = [...TURN_TIMER_CHOICES];
  if (current !== null && !choices.includes(current)) choices.push(current);
  choices.sort((a, b) => a - b);

  const change = async (value: string) => {
    const ack = await connection.request('lobby:setOptions', {
      turnTimerSeconds: value === '' ? null : Number(value),
    });
    setProblem(ack.ok ? null : error(ack.error));
  };

  return (
    <div className="option">
      <label>
        <span>{t('options.timer')}</span>
        <select
          className="input"
          value={current === null ? '' : String(current)}
          onChange={(e) => void change(e.target.value)}
        >
          <option value="">{t('options.timerOff')}</option>
          {choices.map((n) => (
            <option key={n} value={String(n)}>
              {t('options.timerChoice', { n })}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{t('options.timerHelp')}</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
