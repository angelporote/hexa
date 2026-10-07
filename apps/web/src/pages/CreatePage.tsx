import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MAX_NAME_LENGTH } from '@hexa/protocol';
import type { PlayerColor } from '@hexa/protocol';
import { ColorPicker } from '../components/ColorPicker.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { LanguageSwitch } from '../components/LanguageSwitch.js';
import { useI18n } from '../i18n/index.js';
import { useConnection, useSnapshot } from '../net/provider.js';
import { savedName, saveName } from './saved-name.js';

/** Crear una sala a distancia: sin pantalla principal; quien la crea también juega y la administra. */
export function CreatePage() {
  const { t, error } = useI18n();
  const connection = useConnection();
  const snapshot = useSnapshot();
  const navigate = useNavigate();

  const [name, setName] = useState(savedName);
  const [color, setColor] = useState<PlayerColor | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    connection.start('player');
  }, [connection]);

  const trimmed = name.trim();
  const connected = snapshot.status === 'connected' && !snapshot.resuming;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      return setProblem(t('join.invalidName'));
    }
    setBusy(true);
    setProblem(null);
    const ack = await connection.createRoom({
      role: 'player',
      name: trimmed,
      ...(color ? { color } : {}),
    });
    setBusy(false);
    if (!ack.ok) return setProblem(error(ack.error));
    saveName(trimmed);
    navigate(`/play/${ack.data.code}`);
  };

  return (
    <main className="join">
      <ConnectionBanner snapshot={snapshot} />
      <div className="join-top">
        <LanguageSwitch />
      </div>
      <h1 className="brand">{t('create.title')}</h1>
      <p className="lead">{t('create.help')}</p>
      <form className="join-form" onSubmit={(e) => void submit(e)} noValidate>
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
        <ColorPicker legend={t('join.color')} value={color} onChange={setColor} />
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !connected}>
          {busy ? t('create.creating') : t('create.submit')}
        </button>
      </form>
      <Link className="link-btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}
