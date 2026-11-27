import { useRef, useState, type TouchEvent } from 'react';
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const product = products.find((item) => item.id === id);
  // Одно фиксированное фото: первое из images. cover — только запасной вариант,
  // если админ заполнил исключительно обложку.
  const photo = product?.images[0] || product?.cover;

  // Возврат в предыдущее меню (каталог / архив / поиск).
  // Если товар открыли по прямой ссылке, истории приложения нет — ведём в каталог.
  const goBack = () => {
    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === 'number' && state.idx > 0) navigate(-1);
    else navigate('/');
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
        <h1 className="detail-name">{product.name}</h1>

        <div className="detail-gallery">
          {photo ? (
            <figure className="detail-photo">
              <img src={resolveAssetUrl(photo)} alt={product.name} decoding="async" />
            </figure>
          ) : (
            <div className="detail-photo detail-photo-empty">NO PHOTO</div>
          )}
        </div>

        <div className="detail-body">
          <div className="detail-price">{product.price}</div>

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

