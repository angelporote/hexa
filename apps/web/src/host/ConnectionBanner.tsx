import { useI18n } from '../i18n/index.js';
import type { ConnectionSnapshot } from '../net/connection.js';

/** Aviso visible cuando la conexión no está en buen estado. */
export function ConnectionBanner({ snapshot }: { snapshot: ConnectionSnapshot }) {
  const { t } = useI18n();
  if (snapshot.replaced) {
    return (
      <div className="banner banner-error" role="alert">
        {t('conn.replaced')}
      </div>
    );
  }
  if (snapshot.status === 'connected' || snapshot.status === 'idle') return null;
  const key =
    snapshot.status === 'connecting'
      ? 'conn.connecting'
      : snapshot.status === 'reconnecting'
        ? 'conn.reconnecting'
        : 'conn.offline';
  return (
    <div className="banner" role="status">
      {t(key)}
    </div>
  );
}
