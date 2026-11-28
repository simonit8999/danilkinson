import { useLocation, useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  emptyText: string;
}

export function ProductGrid({ products, emptyText }: ProductGridProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="product-grid">
      {products.length === 0 ? (
        <div className="grid-empty">{emptyText}</div>
      ) : products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          // Запоминаем меню, из которого открыли товар: свайп «назад»
          // вернёт именно туда, а не на произвольную запись истории.
          onOpen={() => navigate(
            `/item/${encodeURIComponent(product.id)}`,
            { state: { from: location.pathname } },
          )}
        />
      ))}
    </div>
  );
}
