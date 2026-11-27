/**
 * Общая логика горизонтальных свайпов.
 *
 * Жест считается свайпом только если он заметно длиннее по горизонтали,
 * чем по вертикали. Так обычный скролл страницы и пинч-зум не срабатывают
 * как переключение экрана.
 */

export interface SwipePoint {
  x: number;
  y: number;
}

export type SwipeDirection = 'left' | 'right';

/** Минимальная длина горизонтального жеста, px. */
export const SWIPE_MIN_DISTANCE = 64;

/** Горизонталь должна быть длиннее вертикали во столько раз. */
export const SWIPE_DIRECTION_RATIO = 1.5;

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

export function getSwipeDirection(start: SwipePoint, end: SwipePoint): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) <= Math.abs(dy) * SWIPE_DIRECTION_RATIO) return null;

  return dx > 0 ? 'right' : 'left';
}
