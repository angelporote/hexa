import { Link } from 'react-router-dom';
import { LanguageSwitch } from '../host/LanguageSwitch.js';
import { useI18n } from '../i18n/index.js';

export function HomePage() {
  const { t } = useI18n();
  return (
    <main className="home">
      <div className="home-top">
        <LanguageSwitch />
      </div>
      <h1 className="brand brand-xl">{t('home.title')}</h1>
      <p className="lead">{t('home.subtitle')}</p>
      <div className="home-actions">
        <Link className="btn btn-primary btn-lg" to="/host">
          {t('home.host')}
        </Link>
        <Link className="btn btn-lg" to="/join">
          {t('home.join')}
        </Link>
      </div>
    </main>
  );
}
