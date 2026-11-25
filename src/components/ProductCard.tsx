import type { KeyboardEvent, MouseEvent } from 'react';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onOpen: () => void;
  onOrder: () => void;
}

export function ProductCard({ product, onOpen, onOrder }: ProductCardProps) {
  const cover = product.cover || product.images[0];

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
          src={cover}
          alt={product.name}
          className={product.soldOut ? 'sold-out-img' : undefined}
          loading="lazy"
          decoding="async"
        />
        {product.soldOut && <div className="sold-out-badge">SOLD OUT</div>}
      </div>

      <div className="product-info">
        <div className="product-name" title={product.name}>
          {product.name}
        </div>
        <div className="product-price">{product.price}</div>
        {!product.soldOut && (
          <button className="card-order-btn" type="button" onClick={onOrderClick}>
            BUY
          </button>
        )}
      </div>
    </div>
  );
}
