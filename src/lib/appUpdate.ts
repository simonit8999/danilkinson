/**
 * Жёсткий сброс клиентского кеша: снимает регистрацию service worker,
 * удаляет Cache Storage и перезагружает страницу. Сами данные каталога
 * (ua_catalog_cache_v1) не стираются — они нужны для офлайна, а свежие
 * данные приложение запросит при старте.
 */
export async function hardRefreshApp(): Promise<void> {
  // На github.io один origin делят несколько проектов: снимаем только свой
  // service worker (его scope совпадает с папкой приложения) и удаляем
  // только кеши ua-pwa-*, чтобы не ломать соседние сайты.
  let scope = `${window.location.origin}/`;
  try {
    scope = new URL(import.meta.env.BASE_URL, window.location.href).href;
  } catch {
    // оставляем origin
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === scope)
          .map((registration) => registration.unregister()),
      );
    }
  } catch {
    // service worker может быть недоступен (приватный режим, http)
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('ua-pwa-'))
          .map((key) => caches.delete(key)),
      );
    }
  } catch {
    // Cache Storage может быть недоступен
  }

  window.location.reload();
}
