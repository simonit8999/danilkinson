/**
 * Общие правила для жестов.
 *
 * Сами свайпы теперь считает framer-motion (drag="x" + dragConstraints),
 * поэтому ручная арифметика направлений больше не нужна. Здесь остаётся
 * только список элементов, на которых жест перетаскивания не начинаем.
 */

/** Элементы, на которых свайп не перехватываем. */
const BLOCKED_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '.modal-overlay',
  '.fullscreen-overlay',
  '[data-no-swipe]',
].join(', ');

export function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(BLOCKED_SELECTOR));
}

