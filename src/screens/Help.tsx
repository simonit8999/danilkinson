import { useState } from 'react';
import { CONFIG } from '../config';
import { useCatalog, type CatalogSource } from '../context/CatalogContext';
import { hardRefreshApp } from '../lib/appUpdate';

const SOURCE_LABEL: Record<CatalogSource, string> = {
  server: 'LIVE SERVER',
  cache: 'SAVED COPY (OFFLINE)',
  published: 'PUBLISHED STATIC FILE',
  seed: 'BUILT-IN DEMO CATALOG',
  local: 'UNPUBLISHED ADMIN CHANGES',
};

export function Help() {
  const telegram = `https://t.me/${CONFIG.telegramUsername}`;
  const channel = `https://t.me/${CONFIG.channel}`;
  const reviews = `https://t.me/${CONFIG.reviews}`;

  const { products, serverOnline, serverUpdatedAt, source, refreshCatalog } = useCatalog();
  const [status, setStatus] = useState('');

  const updatedAt = serverUpdatedAt
    ? new Date(serverUpdatedAt).toLocaleString()
    : '—';

  const refresh = async () => {
    setStatus('REFRESHING...');
    const ok = await refreshCatalog();
    setStatus(ok
      ? 'DATA UPDATED.'
      : 'SERVER DID NOT RESPOND — SHOWING SAVED DATA.');
  };

  const resetCache = async () => {
    setStatus('RESETTING CACHE...');
    await hardRefreshApp();
  };

  return (
    <div className="screen fade-in">
      <h1 className="screen-header">HELP</h1>

      <div className="help-block">
        <p>
          <strong>TELEGRAM:</strong>{' '}
          <a href={telegram} target="_blank" rel="noopener noreferrer">
            @{CONFIG.telegramUsername}
          </a>
        </p>
        <p>
          <strong>CHANNEL:</strong>{' '}
          <a href={channel} target="_blank" rel="noopener noreferrer">
            t.me/{CONFIG.channel}
          </a>
        </p>
        <p>
          <strong>REVIEWS:</strong>{' '}
          <a href={reviews} target="_blank" rel="noopener noreferrer">
            t.me/{CONFIG.reviews}
          </a>
        </p>
      </div>

      <div className="help-block">
        <p><strong>DATA:</strong> {products.length} ITEMS · UPDATED {updatedAt}</p>
        <p>
          <strong>STATUS:</strong>{' '}
          {serverOnline ? 'SERVER ONLINE' : 'SERVER OFFLINE — SHOWING SAVED DATA'}
        </p>
        <p><strong>SOURCE:</strong> {SOURCE_LABEL[source]}</p>

        <div className="admin-actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => void refresh()}>REFRESH DATA</button>
          <button type="button" onClick={() => void resetCache()}>RESET CACHE</button>
        </div>

        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>

      <div className="help-block">
        <p>FOR SUPPORT AND INQUIRIES CONTACT US ON TELEGRAM.</p>
        <p>ALL ITEMS ARE ARCHIVE / LIMITED.</p>
      </div>
    </div>
  );
}
