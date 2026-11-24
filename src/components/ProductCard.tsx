import type { KeyboardEvent, MouseEvent } from 'react';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onOpen: () => void;
  onOrder: () => void;
}

export function ProductCard({ product, onOpen, onOrder }: ProductCardProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  const onOrderClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOrder();
  };

  return (
    <div
      className="product-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <div className="product-image-wrapper">
        <img
          src={product.images[0]}
          alt={product.name}
          className={product.soldOut ? 'sold-out-img' : undefined}
          loading="lazy"
        />
        {product.soldOut && <div className="sold-out-badge">SOLD OUT</div>}
      </div>

      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-price">{product.price}</div>
        {!product.soldOut && (
          <button className="card-order-btn" type="button" onClick={onOrderClick}>
            Добавить в корзину
          </button>
        )}
      </div>
    </div>
  );
}
