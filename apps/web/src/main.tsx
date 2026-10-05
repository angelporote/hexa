import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { I18nProvider } from './i18n/index.js';
import { ConnectionProvider } from './net/provider.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
