import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { OrderModal } from './OrderModal';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  emptyText: string;
}

const emptyStyle = {
  gridColumn: '1/-1',
  fontFamily: "'Courier New', monospace",
  padding: '20px 0',
  background: '#fff',
} as const;

export function ProductGrid({ products, emptyText }: ProductGridProps) {
  const navigate = useNavigate();
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);

  return (
    <>
      <div className="product-grid">
        {products.length === 0 ? (
          <div style={emptyStyle}>{emptyText}</div>
        ) : products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onOpen={() => navigate(`/item/${encodeURIComponent(product.id)}`)}
            onOrder={() => setOrderProduct(product)}
          />
        ))}
      </div>

      {orderProduct && (
        <OrderModal product={orderProduct} onClose={() => setOrderProduct(null)} />
      )}
    </>
  );
}
