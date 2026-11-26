import { CONFIG } from '../config';
import type { Product } from '../types';
import {
  hasApiBaseOverride,
  normalizeApiBase,
  readApiBase,
  resetApiBase,
} from './apiBase';

// Адрес вычисляется на каждый запрос: его можно поменять из админки
// (поле API BASE), не пересобирая сайт.
const withBase = (path: string) => `${readApiBase()}${path}`;

const NO_CACHE = { 'ngrok-skip-browser-warning': '1' } as const;

async function request(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(withBase(path), {
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

/** Каталог с сервера. null — сервер недоступен (сайт работает в локальном режиме). */
async function readRemoteCatalog(): Promise<RemoteCatalog | null> {
  try {
    const response = await request('/api/catalog');
    if (!response.ok) return null;

    const data = (await response.json()) as RemoteCatalog;
    if (!data || !data.products) return null;

    return data;
  } catch {
    return null;
  }
}

export async function fetchRemoteCatalog(): Promise<RemoteCatalog | null> {
  const primary = await readRemoteCatalog();
  if (primary) return primary;

  // В localStorage мог остаться старый домен ngrok. Пробуем адрес из сборки
  // (VITE_API_URL) и забываем нерабочую ссылку, чтобы клиент не «залипал».
  if (hasApiBaseOverride() && CONFIG.apiBase) {
    resetApiBase();
    return readRemoteCatalog();
  }

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
