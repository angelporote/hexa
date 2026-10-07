import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MAX_NAME_LENGTH, PLAYER_COLORS, ROOM_CODE_LENGTH } from '@hexa/protocol';
import { playerColors } from '@hexa/theme';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { LanguageSwitch } from '../components/LanguageSwitch.js';
import { useI18n } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import { useConnection, useSnapshot } from '../net/provider.js';
import { cleanCode } from './clean-code.js';
import { savedName, saveName } from './saved-name.js';

const COLOR_LABELS: Record<(typeof PLAYER_COLORS)[number], MessageKey> = {
  c1: 'color.c1',
  c2: 'color.c2',
  c3: 'color.c3',
  c4: 'color.c4',
};

/** Unirse a una sala desde el móvil: código (o QR), nombre y color. */
export function JoinPage() {
  const { t, error } = useI18n();
  const connection = useConnection();
  const snapshot = useSnapshot();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [code, setCode] = useState(() => cleanCode(params.get('code') ?? ''));
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState<(typeof PLAYER_COLORS)[number] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // La conexión se abre al llegar para que unirse sea inmediato (y no se cierra al navegar).
  useEffect(() => {
    connection.start('player');
  }, [connection]);

  const trimmed = name.trim();
  const codeOk = code.length === ROOM_CODE_LENGTH;
  const nameOk = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
  const connected = snapshot.status === 'connected' && !snapshot.resuming;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk) return setProblem(t('join.invalidCode'));
    if (!nameOk) return setProblem(t('join.invalidName'));
    setBusy(true);
    setProblem(null);
    const ack = await connection.join(code, trimmed, color ?? undefined);
    setBusy(false);
    if (!ack.ok) return setProblem(error(ack.error));
    saveName(trimmed);
    navigate(`/play/${code}`);
  };

  return (
    <main className="join">
      <ConnectionBanner snapshot={snapshot} />
      <div className="join-top">
        <LanguageSwitch />
      </div>
      <h1 className="brand">{t('join.title')}</h1>
      <form className="join-form" onSubmit={(e) => void submit(e)} noValidate>
        <label>
          <span>{t('join.code')}</span>
          <input
            className="input input-code"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABCD"
            aria-describedby="code-help"
          />
          <small id="code-help" className="muted">
            {t('join.codeHelp')}
          </small>
        </label>
        <label>
          <span>{t('join.name')}</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
          />
        </label>
        <fieldset className="color-picker">
          <legend>{t('join.color')}</legend>
          {PLAYER_COLORS.map((c) => (
            <label key={c} className={color === c ? 'color-option selected' : 'color-option'}>
              <input
                type="radio"
                name="color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
              />
              <span
                className="swatch swatch-lg"
                style={{ background: playerColors[c].fill, borderColor: playerColors[c].stroke }}
              />
              <span className="sr-only">{t(COLOR_LABELS[c])}</span>
            </label>
          ))}
        </fieldset>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !connected}>
          {busy ? t('join.joining') : t('join.submit')}
        </button>
      </form>
      <Link className="link-btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}
