import { CONFIG } from '../config';
import { removeKey } from './storage';

/**
 * Адрес API можно задать четырьмя способами (по убыванию приоритета):
 *   1. в браузере: поле API BASE в админке или ссылка ?api=https://...
 *   2. при сборке: VITE_API_URL
 *   3. при сборке, для хостинга без API: VITE_PUBLIC_API_URL
 *   4. не задан — тот же origin на локальном сервере, а на GitHub Pages —
 *      постоянный домен туннеля (CONFIG.publicApiBase)
 *
 * Это нужно, потому что GitHub Pages — статика без /api/*, а бесплатный
 * домен ngrok может смениться: сборка «запекает» адрес навсегда, поэтому
 * клиент дополнительно перебирает сохранённый и публичный адреса.
 */

export const normalizeApiBase = (value: string) => value.trim().replace(/\/+$/, '');

/** Событие для UI: адрес API изменился (в т.ч. автоматически). */
export const API_BASE_CHANGED = 'ua:api-base-changed';

function notifyApiBaseChanged(): void {
  try {
    window.dispatchEvent(new Event(API_BASE_CHANGED));
  } catch {
    // window может быть недоступен в тестах
  }
}

function readStored(): string {
  try {
    const raw = window.localStorage.getItem(CONFIG.storage.apiBase);
    return raw ? normalizeApiBase(raw) : '';
  } catch {
    return '';
  }
}

export function readApiBase(): string {
  return readStored() || defaultApiBase();
}

/** Сохранённый в браузере адрес (поле API BASE / ?api=...). */
export function readStoredApiBase(): string {
  return readStored();
}

/**
 * Локальные адреса: сайт открыт со своего сервера, API — там же.
 * Для них публичный домен туннеля не нужен.
 */
const LOCAL_HOST = /^(?:localhost|127(?:\.\d+){3}|\[::1\]|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|[\w-]+\.local)$/i;

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOST.test(hostname);
}

/**
 * Адрес API из сборки. На локальном сервере — тот же origin (пустая строка),
 * на GitHub Pages — постоянный домен сервера (CONFIG.publicApiBase).
 */
function defaultApiBase(): string {
  // VITE_API_URL из сборки важнее адреса по умолчанию.
  if (CONFIG.apiBase) return CONFIG.apiBase;
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) return '';
  return CONFIG.publicApiBase;
}

export interface ApiBaseCandidate {
  base: string;
  /** Адрес сохранён в браузере: нерабочий можно забыть. */
  stored: boolean;
}

/**
 * Все адреса API, которые имеет смысл попробовать, по убыванию приоритета:
 * сохранённый в браузере → из сборки → публичный домен сервера.
 *
 * Нужно, чтобы клиент не «залипал» на старом домене ngrok: если сохранённый
 * адрес не отвечает, запрос уходит на следующий, а мёртвая ссылка стирается.
 */
export function apiBaseCandidates(): ApiBaseCandidate[] {
  const candidates: ApiBaseCandidate[] = [];

  const add = (value: string, stored = false) => {
    const base = normalizeApiBase(value);
    if (candidates.some((item) => item.base === base)) return;
    candidates.push({ base, stored });
  };

  if (hasApiBaseOverride()) add(readStored(), true);
  if (CONFIG.apiBase) add(CONFIG.apiBase);
  add(defaultApiBase());

  return candidates;
}

export function hasApiBaseOverride(): boolean {
  return readStored() !== '';
}

/** Пустая строка — вернуть адрес из сборки (тот же origin). */
export function saveApiBase(value: string): string {
  const next = normalizeApiBase(value);

  try {
    if (next) window.localStorage.setItem(CONFIG.storage.apiBase, next);
    else window.localStorage.removeItem(CONFIG.storage.apiBase);
  } catch {
    // localStorage может быть недоступен — работаем на адресе из сборки
  }

  notifyApiBaseChanged();

  return next || defaultApiBase();
}

export function resetApiBase(): void {
  removeKey(CONFIG.storage.apiBase);
  notifyApiBaseChanged();
}

/**
 * ?api=https://домен.ngrok-free.dev — адрес туннеля можно передать ссылкой
 * (удобно для GitHub Pages: не нужно пересобирать сайт). Адрес запоминается
 * в браузере, а параметр убирается из адресной строки.
 */
export function detectApiBaseParam(): string | null {
  const search = new URLSearchParams(window.location.search);
  const fromSearch = search.get('api');

  if (fromSearch) {
    saveApiBase(fromSearch);
    search.delete('api');
    const query = search.toString();

    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );

    return readApiBase();
  }

  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;

  const hashQuery = new URLSearchParams(hash.slice(queryIndex + 1));
  const fromHash = hashQuery.get('api');
  if (!fromHash) return null;

  saveApiBase(fromHash);
  hashQuery.delete('api');
  const rest = hashQuery.toString();

  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${window.location.search}${hash.slice(0, queryIndex)}${rest ? `?${rest}` : ''}`,
  );

  return readApiBase();
}
