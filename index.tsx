import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PublicMenuPage } from './components/PublicMenuPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isPublicMenu = /^\/cardapio\/[^/]+\/[^/]+\/?$/.test(window.location.pathname);
root.render(
  <React.StrictMode>
    {isPublicMenu ? <PublicMenuPage /> : <App />}
  </React.StrictMode>
);
