import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.js';

/** Enlace para invitar a otras personas a una sala a distancia: copiar o compartir. */
export function ShareRoom({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => `${window.location.origin}/join?code=${code}`, [code]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: el enlace sigue visible para copiarlo a mano.
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: t('app.name'), url });
    } catch {
      // El usuario canceló el menú de compartir.
    }
  };

  return (
    <section className="share" aria-label={t('share.title')}>
      <p className="muted">{t('share.help')}</p>
      <input
        className="input share-url"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={t('share.link')}
      />
      <div className="panel-actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? t('share.copied') : t('share.copy')}
        </button>
        {canShare && (
          <button type="button" className="btn btn-primary" onClick={() => void share()}>
            {t('share.share')}
          </button>
        )}
      </div>
    </section>
  );
}
