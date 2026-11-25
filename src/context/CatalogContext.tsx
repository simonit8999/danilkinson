import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CONFIG } from '../config';
import { seedProducts } from '../data/seed';
import { fetchRemoteCatalog, putRemoteCatalog } from '../lib/api';
import { detectApiBaseParam, readApiBase, saveApiBase } from '../lib/apiBase';
import { hashString, newProductId, normalizeProducts } from '../lib/products';
import { readJson, removeKey, sessionGet, sessionRemove, writeJson } from '../lib/storage';
import type { Product } from '../types';

interface LocalCatalog {
  baseHash: string;
  products: Product[];
}

/** idle — всё синхронизировано, offline — сервер недоступен/нет токена. */
export type SyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

interface CatalogApi {
  products: Product[];
  visible: Product[];
  archived: Product[];
  loading: boolean;
  dirty: boolean;
  stale: boolean;
  sync: SyncState;
  serverOnline: boolean;
  serverUpdatedAt: string | null;
  /** Адрес API: пусто = тот же origin (сайт открыт с сервера/туннеля). */
  apiBase: string;
  applyApiBase: (value: string) => Promise<boolean>;
  saveProduct: (input: Omit<Product, 'id'>, id?: string) => void;
  deleteProduct: (id: string) => void;
  archiveProduct: (id: string) => void;
  restoreProduct: (id: string) => void;
  markSoldOut: (id: string) => void;
  exportJson: () => string;
  importJson: (text: string) => number;
  resetLocal: () => void;
  publishNow: () => Promise<void>;
  reloadFromServer: () => Promise<void>;
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
  const [sync, setSync] = useState<SyncState>('idle');
  const [serverOnline, setServerOnline] = useState(false);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState<string>(() => readApiBase());

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Значения для фоновой проверки сервера: чтобы интервал не пересоздавался.
  const dirtyRef = useRef(false);
  const serverOnlineRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    serverOnlineRef.current = serverOnline;
  }, [serverOnline]);

  const publish = useCallback(async (next: Product[]) => {
    const token = sessionGet(CONFIG.storage.serverToken);
    if (!token) {
      setSync('offline');
      return;
    }

    setSync('saving');
    try {
      const result = await putRemoteCatalog(next, token);
      const hash = hashString(JSON.stringify(next));

      setPublished(next);
      setPublishedHash(hash);
      setServerUpdatedAt(result.updatedAt);
      setServerOnline(true);
      setDirty(false);
      setStale(false);
      setSync('saved');
      writeJson(CONFIG.storage.catalog, { baseHash: hash, products: next });
    } catch (error) {
      console.warn('[catalog] publish failed', error);

      // Сервер перезапускали: старый токен больше не принимается.
      // Сбрасываем его, чтобы админка показала «войдите заново», а не SAVE FAILED.
      if ((error as { status?: number }).status === 401) {
        sessionRemove(CONFIG.storage.serverToken);
        setSync('offline');
        return;
      }

      setSync('error');
    }
  }, []);

  const schedulePublish = useCallback((next: Product[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void publish(next);
    }, 700);
  }, [publish]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // ?api=https://... — адрес туннеля можно передать ссылкой.
      const override = detectApiBaseParam();
      if (override) setApiBase(override);

      const remote = await fetchRemoteCatalog();
      if (!alive) return;

      setServerOnline(remote !== null);
      if (remote?.updatedAt) setServerUpdatedAt(remote.updatedAt);

      const list = remote ? normalizeProducts(remote.products) : await fetchPublished();
      if (!alive) return;

      const hash = hashString(JSON.stringify(list));
      const local = readLocal();

      setPublished(list);
      setPublishedHash(hash);
      setProducts(local ? local.products : list);
      setDirty(local !== null);
      setStale(local !== null && local.baseHash !== hash);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Сервер могли запустить позже страницы или он падал по пути: раз в 15 секунд
  // проверяем каталог. Когда связь возвращается, статус снова SERVER: ONLINE
  // без перезагрузки, и — если локальных правок нет — подтягивается серверный
  // каталог. Локальные правки не перетираем, их публикует publish().
  useEffect(() => {
    let busy = false;

    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;

      try {
        const remote = await fetchRemoteCatalog();
        const cameBack = !serverOnlineRef.current && remote !== null;

        setServerOnline(remote !== null);
        if (!remote) return;

        if (remote.updatedAt) setServerUpdatedAt(remote.updatedAt);

        // Без токена писать нельзя: LOCAL ONLY остаётся, даже когда сервер жив.
        if (sessionGet(CONFIG.storage.serverToken)) {
          setSync((prev) => (prev === 'offline' || prev === 'error' ? 'idle' : prev));
        }

        if (!cameBack) return;

        const list = normalizeProducts(remote.products);
        if (!list.length || dirtyRef.current || readLocal()) return;

        setProducts(list);
        setPublished(list);
        setPublishedHash(hashString(JSON.stringify(list)));
        setStale(false);
      } finally {
        busy = false;
      }
    };

    const wake = () => {
      void check();
    };

    const id = setInterval(wake, 15000);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);

    return () => {
      clearInterval(id);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
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

    schedulePublish(next);
  }, [publishedHash, schedulePublish]);

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

  const publishNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await publish(products);
  }, [publish, products]);

  const reloadFromServer = useCallback(async () => {
    const remote = await fetchRemoteCatalog();
    if (!remote) {
      setServerOnline(false);
      setSync('offline');
      return;
    }

    const list = normalizeProducts(remote.products);
    const hash = hashString(JSON.stringify(list));

    removeKey(CONFIG.storage.catalog);
    setPublished(list);
    setPublishedHash(hash);
    setProducts(list);
    setDirty(false);
    setStale(false);
    setSync('idle');
    setServerOnline(true);
    setServerUpdatedAt(remote.updatedAt ?? null);
  }, []);

  const exportJson = useCallback(() => JSON.stringify(products, null, 2), [products]);

  /**
   * Смена адреса API без пересборки сайта: сохраняем адрес и сразу проверяем
   * сервер. Возвращает true, если сервер ответил.
   */
  const applyApiBase = useCallback(async (value: string) => {
    const next = saveApiBase(value);
    setApiBase(next);
    setSync('idle');

    const remote = await fetchRemoteCatalog();
    if (!remote) {
      setServerOnline(false);
      setSync('offline');
      return false;
    }

    if (remote.updatedAt) setServerUpdatedAt(remote.updatedAt);

    const list = normalizeProducts(remote.products);
    const hash = hashString(JSON.stringify(list));

    setServerOnline(true);
    setSync('idle');

    // Локальные правки не перетираем: их отправит PUBLISH NOW.
    if (dirtyRef.current || readLocal()) return true;

    setProducts(list);
    setPublished(list);
    setPublishedHash(hash);
    setStale(false);
    return true;
  }, []);

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
    setSync('idle');
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
    sync,
    serverOnline,
    serverUpdatedAt,
    apiBase,
    applyApiBase,
    saveProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    markSoldOut,
    exportJson,
    importJson,
    resetLocal,
    publishNow,
    reloadFromServer,
  }), [
    products,
    visible,
    archived,
    loading,
    dirty,
    stale,
    sync,
    serverOnline,
    serverUpdatedAt,
    apiBase,
    applyApiBase,
    saveProduct,
    deleteProduct,
    archiveProduct,
    restoreProduct,
    markSoldOut,
    exportJson,
    importJson,
    resetLocal,
    publishNow,
    reloadFromServer,
  ]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
