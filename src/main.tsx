import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CONFIG } from './config';
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
  // Был ли контроллер до регистрации: при самом первом визите перезагружаться
  // не нужно, иначе получим лишний reload сразу после установки SW.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;

    // Не перезагружаем вкладку с открытой админкой: можно потерять форму.
    let adminActive = false;
    try {
      adminActive = sessionStorage.getItem(CONFIG.storage.adminEntry) === '1';
    } catch {
      // sessionStorage может быть недоступен
    }
    if (adminActive) return;

    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => {
        const update = () => {
          void registration.update().catch(() => {
            // нет сети — проверим позже
          });
        };

        // Проверяем новый SW сразу и при возврате в приложение: установленное
        // PWA не должно ждать обновления сутки.
        update();
        window.setInterval(update, 30 * 60 * 1000);
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) update();
        });
      })
      .catch((error) => console.warn('[pwa] service worker registration failed', error));
  });
}
