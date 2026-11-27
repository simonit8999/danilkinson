import { useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  emptyText: string;
}

export function ProductGrid({ products, emptyText }: ProductGridProps) {
  const navigate = useNavigate();

  return (
    <div className="product-grid">
      {products.length === 0 ? (
        <div className="grid-empty">{emptyText}</div>
      ) : products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onOpen={() => navigate(`/item/${encodeURIComponent(product.id)}`)}
        />
      ))}
    </div>
  );
}
