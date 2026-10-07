import { Component } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/index.js';
import type { ErrorReporter } from './report.js';

function Fallback() {
  const { t } = useI18n();
  return (
    <main className="center error-screen" role="alert">
      <h1>{t('boundary.title')}</h1>
      <p className="lead">{t('boundary.help')}</p>
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={() => window.location.reload()}
      >
        {t('boundary.reload')}
      </button>
    </main>
  );
}

/**
 * Si algo revienta al pintar, en lugar de dejar la pantalla en blanco se avisa y se ofrece
 * recargar (la sesión se conserva, así que se vuelve al mismo asiento). El error se notifica.
 */
export class ErrorBoundary extends Component<
  { reporter: ErrorReporter; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    this.props.reporter.report(error, 'react');
  }

  override render(): ReactNode {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
