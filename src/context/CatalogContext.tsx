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
import { API_BASE_CHANGED, detectApiBaseParam, readApiBase, saveApiBase } from '../lib/apiBase';
import { readCatalogCache, writeCatalogCache } from '../lib/catalogCache';
import { hashString, newProductId, normalizeProducts } from '../lib/products';
import { readJson, removeKey, sessionGet, sessionRemove, writeJson } from '../lib/storage';
import type { Product } from '../types';

interface LocalCatalog {
  baseHash: string;
  products: Product[];
}

/** idle — всё синхронизировано, offline — сервер недоступен/нет токена. */
export type SyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

/** Откуда взяты показанные товары. */
export type CatalogSource = 'server' | 'cache' | 'published' | 'seed' | 'local';

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
  /** Источник текущего каталога — нужен экрану HELP и диагностике. */
  source: CatalogSource;
  /** Адрес API: пусто = тот же origin (сайт открыт с сервера/туннеля). */
  apiBase: string;
  applyApiBase: (value: string) => Promise<boolean>;
  /** Принудительно перечитать каталог с сервера (кнопка REFRESH). */
  refreshCatalog: () => Promise<boolean>;
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

/**
 * Черновик правок админа. Снимок, совпадающий с уже опубликованной версией,
 * черновиком не считается — иначе админ навсегда остаётся в состоянии
 * «есть неопубликованные изменения» и не получает обновления с сервера.
 */
function readDraft(baseHash: string): LocalCatalog | null {
  if (!sessionGet(CONFIG.storage.serverToken)) return null;

  const local = readLocal();
  if (!local) return null;

  if (local.baseHash && local.baseHash === baseHash) {
    removeKey(CONFIG.storage.catalog);
    return null;
  }

  return local;
}

async function fetchPublished(): Promise<{ list: Product[]; fromNetwork: boolean }> {
  try {
    const response = await fetch(CONFIG.dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const list = normalizeProducts(await response.json());
    if (!list.length) throw new Error('EMPTY CATALOG');
    return { list, fromNetwork: true };
  } catch (error) {
    console.warn('[catalog] published data unavailable, using seed', error);
    return { list: normalizeProducts(seedProducts), fromNetwork: false };
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  // Прошлый удачный каталог читаем синхронно: приложение сразу показывает
  // товары (в т.ч. офлайн), а сеть догоняет в фоне.
  const [initialCache] = useState(() => readCatalogCache());

  const [products, setProducts] = useState<Product[]>(() => initialCache?.products ?? []);
  const [published, setPublished] = useState<Product[]>(() => initialCache?.products ?? []);
  const [publishedHash, setPublishedHash] = useState(() => (
    initialCache ? hashString(JSON.stringify(initialCache.products)) : ''
  ));
  const [loading, setLoading] = useState(() => initialCache === null);
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);
  const [sync, setSync] = useState<SyncState>('idle');
  const [serverOnline, setServerOnline] = useState(false);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(
    () => initialCache?.updatedAt ?? null,
  );
  const [source, setSource] = useState<CatalogSource>(() => (initialCache ? 'cache' : 'seed'));
  const [apiBase, setApiBase] = useState<string>(() => readApiBase());

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Значения для фоновой проверки сервера: чтобы интервал не пересоздавался.
  const dirtyRef = useRef(false);
  const serverOnlineRef = useRef(false);
  const publishedHashRef = useRef(publishedHash);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    serverOnlineRef.current = serverOnline;
  }, [serverOnline]);

  useEffect(() => {
    publishedHashRef.current = publishedHash;
  }, [publishedHash]);

  // Адрес API мог измениться автоматически (нерабочий старый домен ngrok).
  useEffect(() => {
    const syncApiBase = () => setApiBase(readApiBase());
    window.addEventListener(API_BASE_CHANGED, syncApiBase);
    return () => window.removeEventListener(API_BASE_CHANGED, syncApiBase);
  }, []);

  /** Запоминает опубликованную версию каталога и её хеш (без ререндера лишних мест). */
  const rememberPublished = useCallback((list: Product[]) => {
    const hash = hashString(JSON.stringify(list));
    publishedHashRef.current = hash;
    setPublished(list);
    setPublishedHash(hash);
    return hash;
  }, []);

  const publish = useCallback(async (next: Product[]) => {
    const token = sessionGet(CONFIG.storage.serverToken);
    if (!token) {
      setSync('offline');
      return;
    }

    setSync('saving');
    try {
      const result = await putRemoteCatalog(next, token);
      rememberPublished(next);

      setServerUpdatedAt(result.updatedAt);
      setServerOnline(true);
      serverOnlineRef.current = true;
      setDirty(false);
      dirtyRef.current = false;
      setStale(false);
      setSync('saved');
      setSource('server');
      writeCatalogCache(next, result.updatedAt);
      // Опубликовано — локальный черновик больше не нужен: иначе после
      // перезагрузки он выглядел бы как несохранённые правки.
      removeKey(CONFIG.storage.catalog);
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
  }, [rememberPublished]);

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

  /** Применяет каталог с сервера, не затирая неопубликованные правки админа. */
  const applyServerCatalog = useCallback((raw: unknown, updatedAt: string | null) => {
    const list = normalizeProducts(raw);
    if (!list.length) return false;

    const hash = rememberPublished(list);
    writeCatalogCache(list, updatedAt);
    setServerUpdatedAt(updatedAt);
    setServerOnline(true);
    serverOnlineRef.current = true;

    if (dirtyRef.current) {
      setStale(true);
      return true;
    }

    // У обычного посетителя локальная копия — просто устаревший кеш:
    // удаляем, чтобы он не «залип» на старом каталоге.
    if (!sessionGet(CONFIG.storage.serverToken)) {
      removeKey(CONFIG.storage.catalog);
    } else {
      readDraft(hash);
    }

    setProducts(list);
    setStale(false);
    setSource('server');
    return true;
  }, [rememberPublished]);

  /**
   * Читает каталог с сервера. Возвращает true, если сервер ответил.
   * Вызывается по таймеру и кнопкой REFRESH: изменения должны доезжать
   * до уже открытых вкладок, а не только после перезагрузки.
   */
  const refreshCatalog = useCallback(async () => {
    const remote = await fetchRemoteCatalog();

    if (!remote) {
      setServerOnline(false);
      serverOnlineRef.current = false;
      return false;
    }

    setServerOnline(true);
    serverOnlineRef.current = true;
    if (remote.updatedAt) setServerUpdatedAt(remote.updatedAt);

    const list = normalizeProducts(remote.products);
    if (!list.length) return true;

    const hash = hashString(JSON.stringify(list));
    if (hash !== publishedHashRef.current) {
      applyServerCatalog(remote.products, remote.updatedAt ?? null);
    } else if (!dirtyRef.current) {
      setStale(false);
    }

    // Без токена писать нельзя: LOCAL ONLY остаётся, даже когда сервер жив.
    if (sessionGet(CONFIG.storage.serverToken)) {
      setSync((prev) => (prev === 'offline' || prev === 'error' ? 'idle' : prev));
    }

    return true;
  }, [applyServerCatalog]);

  useEffect(() => {
    let alive = true;

    (async () => {
      // ?api=https://... — адрес туннеля можно передать ссылкой.
      const override = detectApiBaseParam();
      if (override && alive) setApiBase(override);

      const remote = await fetchRemoteCatalog();
      if (!alive) return;

      if (remote) {
        setServerOnline(true);
        serverOnlineRef.current = true;

        const list = normalizeProducts(remote.products);
        if (list.length) {
          const hash = rememberPublished(list);
          writeCatalogCache(list, remote.updatedAt ?? null);
          setServerUpdatedAt(remote.updatedAt ?? null);

          // Локальная копия — это неопубликованные правки админа.
          const local = readDraft(hash);
          if (!local) removeKey(CONFIG.storage.catalog);

          setProducts(local ? local.products : list);
          setDirty(local !== null);
          dirtyRef.current = local !== null;
          setStale(local !== null && local.baseHash !== hash);
          setSource(local ? 'local' : 'server');
          setLoading(false);
          return;
        }
      } else {
        setServerOnline(false);
        serverOnlineRef.current = false;
      }

      // Сервер не ответил: показываем последние известные данные,
      // а не пустой экран и не встроенный демо-каталог.
      const cached = readCatalogCache();
      const cachedHash = cached ? hashString(JSON.stringify(cached.products)) : '';
      const local = readDraft(cachedHash);
      if (local) {
        setProducts(local.products);
        setDirty(true);
        dirtyRef.current = true;
        setSource('local');
        setLoading(false);
        return;
      }

      if (cached) {
        rememberPublished(cached.products);
        setProducts(cached.products);
        setServerUpdatedAt(cached.updatedAt);
        setSource('cache');
        setLoading(false);
        return;
      }

      const { list, fromNetwork } = await fetchPublished();
      if (!alive) return;

      rememberPublished(list);
      setProducts(list);
      setSource(fromNetwork ? 'published' : 'seed');
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [rememberPublished]);

  // Сервер могли запустить позже страницы, он мог падать или на сервере
  // поменяли фото — раз в 15 секунд сверяем каталог. Новые данные применяются
  // без перезагрузки, но неопубликованные правки админа не перетираются.
  useEffect(() => {
    let busy = false;

    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;

      try {
        await refreshCatalog();
      } finally {
        busy = false;
      }
    };

    const id = setInterval(() => void check(), 15000);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      clearInterval(id);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [refreshCatalog]);

  const persist = useCallback((next: Product[]) => {
    setProducts(next);
    setDirty(true);
    dirtyRef.current = true;
    setStale(false);
    setSource('local');

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
      serverOnlineRef.current = false;
      setSync('offline');
      return;
    }

    const list = normalizeProducts(remote.products);
    if (!list.length) return;

    removeKey(CONFIG.storage.catalog);
    rememberPublished(list);
    writeCatalogCache(list, remote.updatedAt ?? null);
    setProducts(list);
    setDirty(false);
    dirtyRef.current = false;
    setStale(false);
    setSync('idle');
    setServerOnline(true);
    serverOnlineRef.current = true;
    setServerUpdatedAt(remote.updatedAt ?? null);
    setSource('server');
  }, [rememberPublished]);

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
      serverOnlineRef.current = false;
      setSync('offline');
      return false;
    }

    setServerOnline(true);
    serverOnlineRef.current = true;
    if (remote.updatedAt) setServerUpdatedAt(remote.updatedAt);

    const list = normalizeProducts(remote.products);
    if (!list.length) return true;

    const hash = rememberPublished(list);
    writeCatalogCache(list, remote.updatedAt ?? null);

    const local = readDraft(hash);
    if (!local) removeKey(CONFIG.storage.catalog);

    // Локальные правки не перетираем: их отправит PUBLISH NOW.
    if (dirtyRef.current || local) return true;

    setProducts(list);
    setStale(false);
    setSource('server');
    return true;
  }, [rememberPublished]);

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
    dirtyRef.current = false;
    setStale(false);
    setSync('idle');
    setSource(serverOnlineRef.current ? 'server' : 'cache');
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
    source,
    apiBase,
    applyApiBase,
    refreshCatalog,
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
    source,
    apiBase,
    applyApiBase,
    refreshCatalog,
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
