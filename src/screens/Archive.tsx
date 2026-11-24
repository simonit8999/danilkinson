import { useState } from 'react';
import { FullscreenImage } from '../components/FullscreenImage';
import { useCatalog } from '../context/CatalogContext';

const emptyStyle = {
  gridColumn: '1/-1',
  fontFamily: "'Courier New', monospace",
  padding: '20px 0',
  background: '#fff',
} as const;

export function Archive() {
  const { archived } = useCatalog();
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">ARCHIVE</h1>

      <div className="archive-grid">
        {archived.length === 0 ? (
          <div style={emptyStyle}>ARCHIVE IS EMPTY.</div>
        ) : archived.map((product) => (
          <button
            className="archive-item"
            type="button"
            key={product.id}
            onClick={() => setFullscreen(product.images[0])}
          >
            <img src={product.images[0]} alt={product.name} loading="lazy" />
          </button>
        ))}
      </div>

      {fullscreen && (
        <FullscreenImage src={fullscreen} onClose={() => setFullscreen(null)} />
      )}
    </div>
  );
}
