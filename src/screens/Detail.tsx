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

  if (!product) {
    return (
      <div className="screen fade-in detail-screen">
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
      <h1 className="screen-header" style={{ fontSize: 32, marginTop: 12 }}>
        {product.name}
      </h1>

      <Carousel images={product.images} name={product.name} />

      <div className="detail-price">{product.price}</div>

      {product.soldOut && (
        <div
          style={{
            marginTop: 12,
            display: 'inline-block',
            background: '#000',
            color: '#fff',
            fontFamily: "'Anton', sans-serif",
            padding: '6px 18px',
            letterSpacing: 2,
          }}
        >
          SOLD OUT
        </div>
      )}

      <div className="detail-description">{product.description}</div>

      {product.soldOut ? (
        <button className="order-btn" type="button" disabled>
          SOLD OUT
        </button>
      ) : (
        <button className="order-btn" type="button" onClick={() => setOrderOpen(true)}>
          ОФОРМИТЬ ЗАКАЗ
        </button>
      )}

      {orderOpen && (
        <OrderModal product={product} onClose={() => setOrderOpen(false)} />
      )}
    </div>
  );
}
