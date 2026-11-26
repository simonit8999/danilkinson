import { CONFIG } from '../config';
import type { Product } from '../types';
import { normalizeProducts } from './products';
import { readJson, removeKey, writeJson } from './storage';

/**
 * Снимок последнего удачного каталога (с сервера или из опубликованного JSON).
 * Нужен, чтобы приложение открывалось без интернета и показывало последние
 * известные товары и фото, а не встроенный демо-каталог.
 */
export interface CatalogCache {
  products: Product[];
  updatedAt: string | null;
  savedAt: number;
}

export function readCatalogCache(): CatalogCache | null {
  const raw = readJson<unknown>(CONFIG.storage.catalogCache);
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Partial<CatalogCache>;
  if (!Array.isArray(data.products)) return null;

  const products = normalizeProducts(data.products);
  if (!products.length) return null;

  return {
    products,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
  };
}

export function writeCatalogCache(products: Product[], updatedAt: string | null): void {
  if (!products.length) return;

  const ok = writeJson(CONFIG.storage.catalogCache, {
    products,
    updatedAt,
    savedAt: Date.now(),
  } satisfies CatalogCache);

  if (!ok) {
    console.warn('[catalog] cannot persist catalog cache (localStorage is full or blocked)');
  }
}

export function clearCatalogCache(): void {
  removeKey(CONFIG.storage.catalogCache);
}
