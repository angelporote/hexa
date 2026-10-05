import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.js';

/** Marcador de posición: el mando móvil se construye en la fase 4. */
export function JoinPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const code = params.get('code');
  return (
    <main className="home">
      <h1 className="brand">{t('join.title')}</h1>
      {code && <p className="room-code room-code-sm">{code}</p>}
      <p className="lead">{t('join.soon')}</p>
      <Link className="btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}
