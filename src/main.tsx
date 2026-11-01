import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './theme/tokens.css';
import './styles.css';
import { loadPrefs } from './model/profile';
import { applyTheme } from './theme/theme';
import { watchForErrors } from './util/errorLog';

// ?lvds-export: the hidden window of the command line's export (electron/headlessExport.cjs), not the app.
if (new URLSearchParams(window.location.search).has('lvds-export')) {
  import('./headless/rendererExport').then((m) => m.install());
} else {
  watchForErrors();
  // Before the first paint, so a light-theme user never sees a dark flash.
  applyTheme(loadPrefs().app.theme);
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary level="app">
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
