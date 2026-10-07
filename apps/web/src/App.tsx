import { Link, Route, Routes } from 'react-router-dom';
import { useI18n } from './i18n/index.js';
import { CreatePage } from './pages/CreatePage.js';
import { HomePage } from './pages/HomePage.js';
import { HostPage } from './pages/HostPage.js';
import { JoinPage } from './pages/JoinPage.js';
import { PlayPage } from './pages/PlayPage.js';
import { WatchEntryPage, WatchPage } from './pages/WatchPage.js';

function NotFound() {
  const { t } = useI18n();
  return (
    <main className="home">
      <h1 className="brand">404</h1>
      <p className="lead">{t('notFound.text')}</p>
      <Link className="btn" to="/">
        {t('common.back')}
      </Link>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/play/:code" element={<PlayPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/watch" element={<WatchEntryPage />} />
      <Route path="/watch/:code" element={<WatchPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
