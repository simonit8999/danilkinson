import { CONFIG } from '../config';
import type { Product } from '../types';

const withBase = (path: string) => `${CONFIG.apiBase}${path}`;

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

/** Каталог с сервера. null — сервер недоступен (сайт работает в локальном режиме). */
export async function fetchRemoteCatalog(): Promise<RemoteCatalog | null> {
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

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as { updatedAt?: string };
  return { updatedAt: data.updatedAt ?? new Date().toISOString() };
}
