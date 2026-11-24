import { useMemo, useState } from 'react';
import { ProductGrid } from '../components/ProductGrid';
import { useCatalog } from '../context/CatalogContext';
import { sortProducts } from '../lib/products';

export function SearchScreen() {
  const { visible } = useCatalog();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? visible.filter((product) => product.name.toLowerCase().includes(normalized))
      : visible;
    return sortProducts(filtered);
  }, [query, visible]);

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">SEARCH</h1>
      <input
        type="text"
        className="search-input"
        placeholder="TYPE TO FILTER..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ProductGrid products={items} emptyText="NOTHING FOUND." />
    </div>
  );
}
