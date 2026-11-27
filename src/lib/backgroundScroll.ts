/**
 * Фон «приклеен» к контенту: при прокрутке любого экрана (каталог, архив,
 * поиск, товар) бесшовный тайл ткани двигается вместе со страницей и
 * повторяется по вертикали бесконечно.
 *
 * Двигаем не background-position (это перерисовка каждого кадра), а
 * transform слоя: композитор браузера делает это без перерисовки.
 */

/** Тайл public/images/site/site-bg-tile.webp: 704x3776 (см. scripts/build-bg.ps1). */
export const BG_TILE_RATIO = 3776 / 704;

/**
 * 1 — фон движется ровно с контентом, меньше — медленнее (параллакс).
 * 0.6 даёт заметное «прокручивание» ткани, но товары не «плывут».
 */
const BG_SCROLL_FACTOR = 0.6;

/**
 * Связывает прокрутку `.scroll-area` с фоном. Возвращает функцию отписки.
 */
export function bindBackgroundScroll(area: HTMLElement, layer: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let tile = 0;
  let width = 0;
  let lastShift = -1;

  const measure = () => {
    width = area.clientWidth || window.innerWidth;
    tile = Math.max(1, Math.round(width * BG_TILE_RATIO));
    // Слой выше вьюпорта на высоту тайла: при сдвиге вверх низ не оголяется.
    layer.style.setProperty('--bg-tile', `${tile}px`);
  };

  const render = () => {
    frame = 0;
    if (!tile) measure();

    // Остаток по модулю высоты тайла — фон «зацикливается» бесконечно.
    const shift = reduced.matches ? 0 : (area.scrollTop * BG_SCROLL_FACTOR) % tile;
    if (Math.abs(shift - lastShift) < 0.5) return;

    lastShift = shift;
    layer.style.transform = `translate3d(0, ${(-shift).toFixed(1)}px, 0)`;
  };

  const request = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(render);
  };

  const onResize = () => {
    measure();
    lastShift = -1;
    request();
  };

  measure();
  render();

  area.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  reduced.addEventListener('change', request);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    area.removeEventListener('scroll', request);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    reduced.removeEventListener('change', request);
  };
}
