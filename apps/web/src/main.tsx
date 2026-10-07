import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { I18nProvider } from './i18n/index.js';
import { ConnectionProvider } from './net/provider.js';
import { ErrorBoundary } from './monitoring/ErrorBoundary.js';
import { beaconSender, createReporter, installGlobalErrorReporting } from './monitoring/report.js';
import './styles.css';

// Los errores de la web se notifican al servidor, que los deja en su log (ver ADR 0018).
const reporter = createReporter({
  send: beaconSender(),
  path: () => window.location.pathname,
});
installGlobalErrorReporting(reporter);

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ErrorBoundary reporter={reporter}>
          <ConnectionProvider>
            <App />
          </ConnectionProvider>
        </ErrorBoundary>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
