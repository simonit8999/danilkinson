import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/brutalist.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

// Добавляем manifest вручную: Vite не должен хэшировать его в /assets,
// иначе start_url и scope будут считаться относительно /assets/.
const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = `${import.meta.env.BASE_URL}manifest.json`;
document.head.appendChild(manifestLink);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.warn('[pwa] service worker registration failed', error));
  });
}
