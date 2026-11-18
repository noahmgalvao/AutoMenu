import React from 'react';
import ReactDOM from 'react-dom/client';
import { browserServices } from './composition/browserServices';
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
root.render(
  <React.StrictMode>
    <AppServicesProvider services={browserServices}>
      {isPublicMenu ? <PublicMenuPage /> : <App />}
    </AppServicesProvider>
  </React.StrictMode>
);
