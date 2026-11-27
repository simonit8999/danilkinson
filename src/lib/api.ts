import type { Product } from '../types';
import {
  apiBaseCandidates,
  normalizeApiBase,
  readApiBase,
  readStoredApiBase,
  resetApiBase,
} from './apiBase';

// Адрес вычисляется на каждый запрос: его можно поменять из админки
// (поле API BASE), не пересобирая сайт.
const withBase = (path: string, base = readApiBase()) => `${base}${path}`;

// Адрес, который уже ответил, запоминаем: иначе каждые 15 секунд клиент
// заново перебирает мёртвых кандидатов (например, старый домен ngrok).
let preferredBase: string | null = null;

// Сервер ответил хотя бы раз. Нужно lib/assets.ts: относительные фото
// каталога достраиваются до адреса API только когда он реально доступен,
// иначе при выключенном сервере они должны браться с самого сайта.
let serverReachable = false;

const activeBase = () => preferredBase ?? readApiBase();

/** Доступен ли API (последний опрос каталога был успешным). */
export function isServerReachable(): boolean {
  return serverReachable;
}

/** Забыть запомненный адрес: админ сменил API BASE вручную. */
export function forgetPreferredApiBase(): void {
  preferredBase = null;
}

const NO_CACHE = { 'ngrok-skip-browser-warning': '1' } as const;

async function request(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
  base = activeBase(),
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(withBase(path, base), {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: { ...NO_CACHE, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface RemoteCatalog {
  products: unknown;
  updatedAt?: string;
}

/** Сервер отвечает? Используется кнопкой TEST в админке. */
export async function pingServer(base: string, timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizeApiBase(base)}/api/health`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: NO_CACHE,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Каталог с сервера. null — адрес недоступен (сайт работает в локальном режиме). */
async function readRemoteCatalog(base: string): Promise<RemoteCatalog | null> {
  try {
    const response = await request('/api/catalog', {}, 8000, base);
    if (!response.ok) return null;

    const data = (await response.json()) as RemoteCatalog;
    if (!data || !data.products) return null;

    return data;
  } catch {
    return null;
  }
}

export async function fetchRemoteCatalog(): Promise<RemoteCatalog | null> {
  const candidates = apiBaseCandidates();

  // Адрес, который уже сработал, пробуем первым.
  if (preferredBase !== null) {
    candidates.sort((a, b) => (
      Number(b.base === preferredBase) - Number(a.base === preferredBase)
    ));
  }

  for (const candidate of candidates) {
    const data = await readRemoteCatalog(candidate.base);

    if (data) {
      preferredBase = candidate.base;
      serverReachable = true;
      return data;
    }

    // В localStorage мог остаться старый домен ngrok. Забываем нерабочую
    // ссылку и пробуем следующий адрес: из сборки или публичный домен
    // сервера (нужен GitHub Pages, где своего /api/* нет).
    if (candidate.stored && readStoredApiBase() === candidate.base) {
      resetApiBase();
    }
  }

  preferredBase = null;
  serverReachable = false;
  return null;
}

export async function remoteLogin(login: string, password: string): Promise<string | null> {
  try {
    const response = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: login.trim().toLowerCase(), password }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { token?: string };
    return typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

export async function putRemoteCatalog(
  products: Product[],
  token: string,
): Promise<{ updatedAt: string }> {
  const response = await request('/api/catalog', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(products),
  }, 12000);

  if (!response.ok) {
    // status нужен вызывающему коду: 401 = сервер перезапускали, токен протух.
    const error = new Error(`HTTP ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = (await response.json()) as { updatedAt?: string };
  return { updatedAt: data.updatedAt ?? new Date().toISOString() };
}
