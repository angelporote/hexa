import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { useConnection } from '../net/provider.js';

/** Aviso a quien no movió a tiempo: un bot juega por esa persona hasta que pulse para volver. */
export function SubstituteBanner() {
  const { t, error } = useI18n();
  const connection = useConnection();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const back = async () => {
    setBusy(true);
    const ack = await connection.request('seat:return');
    setBusy(false);
    setProblem(ack.ok ? null : error(ack.error));
  };

  return (
    <section className="substitute" role="status">
      <strong>{t('sub.title')}</strong>
      <p>{t('sub.help')}</p>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void back()}>
        {t('sub.return')}
      </button>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
