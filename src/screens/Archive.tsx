import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { FullscreenImage } from '../components/FullscreenImage';
import { useCatalog } from '../context/CatalogContext';
import { resolveAssetUrl } from '../lib/assets';

/**
 * Смещение (px), после которого нажатие по плитке считается свайпом,
 * а не тапом. Плитка живёт внутри общего свайп-контейнера вкладок:
 * если открыть полноэкранное фото «на отпускании» после свайпа, просмотр
 * перекроет экран и заблокирует свайпы (см. lib/swipe.ts) — с ARCHIVE
 * станет невозможно уйти на соседнюю вкладку.
 */
const TAP_SLOP_PX = 12;

export function Archive() {
  const { archived } = useCatalog();
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  // Координаты начала нажатия: по ним отличаем тап от свайпа.
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  // Нажатие превратилось в свайп — клик по плитке игнорируем.
  const moved = useRef(false);

  const photos = useMemo(() => archived
    .map((product) => ({
      id: product.id,
      name: product.name,
      // cover — обложка без фона; images[0] — запасной вариант.
      image: resolveAssetUrl(product.cover || product.images[0] || ''),
    }))
    .filter((item) => Boolean(item.image)), [archived]);

  const onTilePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button > 0) return;
    pressStart.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
  };

  const onTilePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pressStart.current;
    if (!start) return;

    moved.current = Math.abs(event.clientX - start.x) > TAP_SLOP_PX
      || Math.abs(event.clientY - start.y) > TAP_SLOP_PX;
  };

  const onTileClick = (image: string) => {
    // Свайп — это переключение вкладок, а не открытие фото.
    if (moved.current) {
      moved.current = false;
      return;
    }

    setFullscreen(image);
  };

  const onTileKeyDown = (event: KeyboardEvent<HTMLDivElement>, image: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFullscreen(image);
    }
  };

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">ARCHIVE</h1>

      <div className="archive-grid">
        {photos.length === 0 ? (
          <div className="grid-empty">ARCHIVE IS EMPTY.</div>
        ) : photos.map((photo) => (
          <div
            className="archive-item"
            key={photo.id}
            role="button"
            tabIndex={0}
            aria-label={photo.name}
            onPointerDown={onTilePointerDown}
            onPointerUp={onTilePointerUp}
            onPointerCancel={() => {
              pressStart.current = null;
              moved.current = true;
            }}
            onClick={() => onTileClick(photo.image)}
            onKeyDown={(event) => onTileKeyDown(event, photo.image)}
          >
            <img src={photo.image} alt={photo.name} loading="lazy" draggable={false} />
          </div>
        ))}
      </div>

      {fullscreen && (
        <FullscreenImage src={fullscreen} onClose={() => setFullscreen(null)} />
      )}
    </div>
  );
}
