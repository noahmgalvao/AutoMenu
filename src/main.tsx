import React from 'react';
import ReactDOM from 'react-dom/client';
import { browserServices } from './composition/browserServices';
import { AppRecovery } from './presentation/app/AppRecovery';
import App from './presentation/app/App';
import { AppServicesProvider } from './presentation/app/AppServicesProvider';
import { PublicMenuPage } from './presentation/publishing/PublicMenuPage';
import './presentation/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isPublicMenu = /^\/cardapio\/[^/]+\/[^/]+\/?$/.test(window.location.pathname);
document.addEventListener('contextmenu', event => {
  if (event.target instanceof Element && !event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) {
    event.preventDefault();
  }
});
window.addEventListener('vite:preloadError', event => {
  if (!navigator.onLine) return;
  try {
    const key = 'automenu:chunk-reload';
    if (Date.now() - Number(sessionStorage.getItem(key)) < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    // The error boundary still offers reload when session storage is unavailable.
  }
});

root.render(
  <React.StrictMode>
    <AppServicesProvider services={browserServices}>
      <AppRecovery>{isPublicMenu ? <PublicMenuPage /> : <App />}</AppRecovery>
    </AppServicesProvider>
  </React.StrictMode>
);
