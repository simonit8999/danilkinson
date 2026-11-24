import { useMemo } from 'react';
import { ProductGrid } from '../components/ProductGrid';
import { useCatalog } from '../context/CatalogContext';
import { sortProducts } from '../lib/products';

export function Catalog() {
  const { visible, loading } = useCatalog();
  const items = useMemo(() => sortProducts(visible), [visible]);

  return (
    <div className="screen fade-in">
      <ProductGrid
        products={items}
        emptyText={loading ? 'LOADING...' : 'NO ITEMS IN CATALOG.'}
      />
    </div>
  );
}
