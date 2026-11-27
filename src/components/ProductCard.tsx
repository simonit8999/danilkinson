import type { KeyboardEvent } from 'react';
import { resolveAssetUrl } from '../lib/assets';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onOpen: () => void;
}

export function ProductCard({ product, onOpen }: ProductCardProps) {
  const cover = resolveAssetUrl(product.cover || product.images[0]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
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
      </div>
    </div>
  );
}
