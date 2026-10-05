import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.js';

/** Marcador de posición: el mando móvil se construye en la fase 4. */
export function PlayPage() {
  const { t } = useI18n();
  const { code } = useParams();
  return (
    <main className="home">
      <h1 className="brand">{t('join.title')}</h1>
      {code && <p className="room-code room-code-sm">{code.toUpperCase()}</p>}
      <p className="lead">{t('join.soon')}</p>
      <Link className="btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}
