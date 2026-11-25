import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Carousel } from '../components/Carousel';
import { OrderModal } from '../components/OrderModal';
import { useCatalog } from '../context/CatalogContext';

export function Detail() {
  const { id } = useParams<{ id: string }>();
  const { products } = useCatalog();
  const navigate = useNavigate();
  const [orderOpen, setOrderOpen] = useState(false);

  const product = products.find((item) => item.id === id);

  // Возврат в предыдущее меню (каталог / архив / поиск).
  // Если товар открыли по прямой ссылке, истории приложения нет — ведём в каталог.
  const goBack = () => {
    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === 'number' && state.idx > 0) navigate(-1);
    else navigate('/');
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
    <div className="screen fade-in detail-screen">
      <div className="detail-topbar">
        <button className="detail-back" type="button" onClick={goBack}>
          ← BACK
        </button>
      </div>

      <div className="detail-layout">
        <h1 className="detail-name">{product.name}</h1>

        <div className="detail-gallery">
          <Carousel images={product.images} name={product.name} />
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
