import { markAppReady, requestAppReload } from './infrastructure/browser/appLifecycle';
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
  if (requestAppReload('chunk')) event.preventDefault();
});
function AppLifecycle() {
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const ready = () => {
      if (cancelled || markAppReady()) return;
      timer = setTimeout(ready, 100);
    };
    ready();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return null;
}

root.render(
  <React.StrictMode>
    <AppServicesProvider services={browserServices}>
      <AppLifecycle /><AppRecovery>{isPublicMenu ? <PublicMenuPage /> : <App />}</AppRecovery>
    </AppServicesProvider>
  </React.StrictMode>
);
