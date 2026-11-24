import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CONFIG } from '../config';
import { seedProducts } from '../data/seed';
import { hashString, newProductId, normalizeProducts } from '../lib/products';
import { readJson, removeKey, writeJson } from '../lib/storage';
import type { Product } from '../types';

interface LocalCatalog {
  baseHash: string;
  products: Product[];
}

interface CatalogApi {
  products: Product[];
  visible: Product[];
  archived: Product[];
  loading: boolean;
  dirty: boolean;
  stale: boolean;
  saveProduct: (input: Omit<Product, 'id'>, id?: string) => void;
  deleteProduct: (id: string) => void;
  archiveProduct: (id: string) => void;
  restoreProduct: (id: string) => void;
  markSoldOut: (id: string) => void;
  exportJson: () => string;
  importJson: (text: string) => number;
  resetLocal: () => void;
}

const CatalogContext = createContext<CatalogApi | null>(null);

function readLocal(): LocalCatalog | null {
  const raw = readJson<unknown>(CONFIG.storage.catalog);
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return { baseHash: '', products: normalizeProducts(raw) };
  }

  if (typeof raw === 'object') {
    const data = raw as Partial<LocalCatalog>;
    if (Array.isArray(data.products)) {
      return {
        baseHash: typeof data.baseHash === 'string' ? data.baseHash : '',
        products: normalizeProducts(data.products),
      };
    }
  }

  return null;
}

async function fetchPublished(): Promise<Product[]> {
  try {
    const response = await fetch(CONFIG.dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const list = normalizeProducts(await response.json());
    if (!list.length) throw new Error('EMPTY CATALOG');
    return list;
  } catch (error) {
    console.warn('[catalog] published data unavailable, using seed', error);
    return normalizeProducts(seedProducts);
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [published, setPublished] = useState<Product[]>([]);
  const [publishedHash, setPublishedHash] = useState('');
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;

    fetchPublished().then((list) => {
      if (!alive) return;

      const hash = hashString(JSON.stringify(list));
      const local = readLocal();

      setPublished(list);
      setPublishedHash(hash);
      setProducts(local ? local.products : list);
      setDirty(local !== null);
      setStale(local !== null && local.baseHash !== hash);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: Product[]) => {
    setProducts(next);
    setDirty(true);
    setStale(false);

    const payload: LocalCatalog = { baseHash: publishedHash, products: next };
    if (!writeJson(CONFIG.storage.catalog, payload)) {
      console.warn('[catalog] localStorage write failed');
    }
  }, [publishedHash]);

  const saveProduct = useCallback((input: Omit<Product, 'id'>, id?: string) => {
    const next = id
      ? products.map((product) => (product.id === id ? { ...product, ...input, id } : product))
      : [{ ...input, id: newProductId() }, ...products];
    persist(next);
  }, [persist, products]);

  const deleteProduct = useCallback((id: string) => {
    persist(products.filter((product) => product.id !== id));
  }, [persist, products]);

  const archiveProduct = useCallback((id: string) => {
    persist(products.map((product) => (
      product.id === id ? { ...product, archived: true } : product
    )));
  }, [persist, products]);

  const restoreProduct = useCallback((id: string) => {
    persist(products.map((product) => (
      product.id === id ? { ...product, archived: false } : product
    )));
  }, [persist, products]);

  const markSoldOut = useCallback((id: string) => {
    persist(products.map((product) => (
      product.id === id ? { ...product, soldOut: true } : product
    )));
  }, [persist, products]);

  const exportJson = useCallback(() => JSON.stringify(products, null, 2), [products]);

  const importJson = useCallback((text: string) => {
    const parsed = JSON.parse(text) as unknown;
    const next = normalizeProducts(parsed);
    if (!next.length) throw new Error('НЕТ ВАЛИДНЫХ ТОВАРОВ.');
    persist(next);
    return next.length;
  }, [persist]);

  const resetLocal = useCallback(() => {
    removeKey(CONFIG.storage.catalog);
    setProducts(published);
    setDirty(false);
    setStale(false);
  }, [published]);

  const visible = useMemo(
    () => products.filter((product) => !product.archived),
    [products],
  );

  const archived = useMemo(
    () => products.filter((product) => product.archived),
    [products],
  );

  const value = useMemo<CatalogApi>(() => ({
    products,
    visible,
    archived,
    loading,
    dirty,
    stale,
    saveProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    markSoldOut,
    exportJson,
    importJson,
    resetLocal,
  }), [
    products,
    visible,
    archived,
    loading,
    dirty,
    stale,
    saveProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    markSoldOut,
    exportJson,
    importJson,
    resetLocal,
  ]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
