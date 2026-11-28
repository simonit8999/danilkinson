import { useEffect, useRef, type PointerEvent } from 'react';

interface FullscreenImageProps {
  src: string;
  onClose: () => void;
}

/**
 * Свайп по просмотру закрывает его. Оверлей блокирует свайпы вкладок
 * (см. lib/swipe.ts), поэтому у него должен быть свой жест «назад»,
 * иначе с открытого фото нельзя уйти.
 */
const CLOSE_SWIPE_X = 56;
const CLOSE_SWIPE_Y = 72;

export function FullscreenImage({ src, onClose }: FullscreenImageProps) {
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button > 0) return;
    pressStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pressStart.current;
    pressStart.current = null;
    if (!start) return;

    const movedX = Math.abs(event.clientX - start.x);
    const movedY = Math.abs(event.clientY - start.y);
    if (movedX > CLOSE_SWIPE_X || movedY > CLOSE_SWIPE_Y) onClose();
  };

  return (
    <div
      className="fullscreen-overlay"
      onClick={onClose}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pressStart.current = null;
      }}
    >
      <img
        src={src}
        alt="archive full"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        className="fullscreen-close"
        type="button"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
