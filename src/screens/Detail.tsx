import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OrderModal } from '../components/OrderModal';
import { useCatalog } from '../context/CatalogContext';
import { resolveAssetUrl } from '../lib/assets';
import { getSwipeDirection, isSwipeBlockedTarget } from '../lib/swipe';

export function Detail() {
  const { id } = useParams<{ id: string }>();
  const { products } = useCatalog();
  const navigate = useNavigate();
  const [orderOpen, setOrderOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const photoTouch = useRef<{ x: number; y: number } | null>(null);

  const product = products.find((item) => item.id === id);
  // Карусель листает весь массив images; cover — запасной вариант,
  // если админ заполнил исключительно обложку.
  const photos = product
    ? product.images.length > 0
      ? product.images
      : product.cover
        ? [product.cover]
        : []
    : [];
  const photoCount = photos.length;
  const activePhoto = photoCount > 0 ? Math.min(photoIndex, photoCount - 1) : 0;

  // При переходе на другой товар карусель начинается с первого фото.
  useEffect(() => {
    setPhotoIndex(0);
  }, [id]);

  // Возврат в предыдущее меню (каталог / архив / поиск).
  // Если товар открыли по прямой ссылке, истории приложения нет — ведём в каталог.
  const goBack = () => {
    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === 'number' && state.idx > 0) navigate(-1);
    else navigate('/');
  };

  const goToPhoto = (next: number) => {
    if (photoCount < 2) return;
    setPhotoIndex((next + photoCount) % photoCount);
  };

  // Свайпы фото перехватываем у карусели: жест не должен уходить
  // ни в «назад» на уровне страницы, ни в переключение вкладок в App.
  const onPhotoTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.touches.length !== 1) {
      photoTouch.current = null;
      return;
    }

    const touch = event.touches[0];
    photoTouch.current = { x: touch.clientX, y: touch.clientY };
  };

  const onPhotoTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = photoTouch.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);

    // Начался обычный вертикальный скролл — жест больше не считаем свайпом.
    if (dy > 12 && dy > dx) photoTouch.current = null;
  };

  const onPhotoTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = photoTouch.current;
    photoTouch.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const direction = getSwipeDirection(start, { x: touch.clientX, y: touch.clientY });
    if (direction === 'left') goToPhoto(activePhoto + 1);
    else if (direction === 'right') goToPhoto(activePhoto - 1);
  };

  const onPhotoTouchCancel = () => {
    photoTouch.current = null;
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1 || isSwipeBlockedTarget(event.target)) {
      touchStart.current = null;
      return;
    }

    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);

    // Начался обычный вертикальный скролл — жест больше не считаем свайпом.
    if (dy > 12 && dy > dx) touchStart.current = null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    if (getSwipeDirection(start, { x: touch.clientX, y: touch.clientY }) === 'right') {
      goBack();
    }
  };

  const onTouchCancel = () => {
    touchStart.current = null;
  };

  if (!product) {
    return (
      <div className="screen fade-in detail-screen">
        <div className="detail-topbar">
          <button className="detail-back" type="button" onClick={goBack}>
            ← BACK
          </button>
        </div>
        <h1 className="screen-header">NOT FOUND</h1>
        <div className="help-block">
          <p>THIS ITEM IS GONE.</p>
        </div>
        <button className="order-btn" type="button" onClick={() => navigate('/')}>
          BACK TO CATALOG
        </button>
      </div>
    );
  }

  return (
    <div
      className="screen fade-in detail-screen"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div className="detail-topbar">
        <button className="detail-back" type="button" onClick={goBack}>
          ← BACK
        </button>
      </div>

      <div className="detail-layout">
        <div className="detail-heading">
          <h1 className="detail-name">{product.name}</h1>
          <div className="detail-price">{product.price}</div>
        </div>

        <div className="detail-gallery">
          {photoCount > 0 ? (
            <figure
              className="detail-photo"
              aria-roledescription="carousel"
              aria-label={`${product.name}: фото ${activePhoto + 1} из ${photoCount}`}
              onTouchStart={onPhotoTouchStart}
              onTouchMove={onPhotoTouchMove}
              onTouchEnd={onPhotoTouchEnd}
              onTouchCancel={onPhotoTouchCancel}
            >
              <div
                className="detail-carousel-track"
                style={{ transform: `translateX(-${activePhoto * 100}%)` }}
              >
                {photos.map((source, index) => (
                  <div className="detail-carousel-slide" key={`${source}-${index}`}>
                    <img
                      src={resolveAssetUrl(source)}
                      alt={`${product.name} — фото ${index + 1}`}
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>

              {photoCount > 1 && (
                <>
                  <button
                    type="button"
                    className="detail-carousel-arrow detail-carousel-arrow-prev"
                    aria-label="PREVIOUS PHOTO"
                    onClick={() => goToPhoto(activePhoto - 1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="detail-carousel-arrow detail-carousel-arrow-next"
                    aria-label="NEXT PHOTO"
                    onClick={() => goToPhoto(activePhoto + 1)}
                  >
                    ›
                  </button>

                  <div className="detail-carousel-dots">
                    {photos.map((source, index) => (
                      <button
                        key={`dot-${source}-${index}`}
                        type="button"
                        className={
                          index === activePhoto
                            ? 'detail-carousel-dot active'
                            : 'detail-carousel-dot'
                        }
                        aria-label={`PHOTO ${index + 1}`}
                        aria-current={index === activePhoto ? 'true' : undefined}
                        onClick={() => setPhotoIndex(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </figure>
          ) : (
            <div className="detail-photo detail-photo-empty">NO PHOTO</div>
          )}
        </div>

        <div className="detail-body">
          {product.soldOut && <div className="detail-soldout">SOLD OUT</div>}

          <div className="detail-description">{product.description}</div>

          {product.soldOut ? (
            <button className="order-btn" type="button" disabled>
              SOLD OUT
            </button>
          ) : (
            <button className="order-btn" type="button" onClick={() => setOrderOpen(true)}>
              BUY
            </button>
          )}
        </div>
      </div>

      {orderOpen && (
        <OrderModal product={product} onClose={() => setOrderOpen(false)} />
      )}
    </div>
  );
}

