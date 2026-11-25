import { CONFIG } from '../config';
import { removeKey } from './storage';

/**
 * Адрес API можно задать тремя способами (по убыванию приоритета):
 *   1. в браузере: поле API BASE в админке или ссылка ?api=https://...
 *   2. при сборке: VITE_API_URL
 *   3. не задан — тот же origin (сайт открыт с сервера/туннеля, рядом есть /api/*)
 *
 * Это нужно, потому что бесплатный домен ngrok меняется при каждом запуске,
 * а сборка на GitHub Pages «запекает» VITE_API_URL навсегда.
 */

export const normalizeApiBase = (value: string) => value.trim().replace(/\/+$/, '');

function readStored(): string {
  try {
    const raw = window.localStorage.getItem(CONFIG.storage.apiBase);
    return raw ? normalizeApiBase(raw) : '';
  } catch {
    return '';
  }
}

export function readApiBase(): string {
  return readStored() || CONFIG.apiBase;
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

  return next || CONFIG.apiBase;
}

export function resetApiBase(): void {
  removeKey(CONFIG.storage.apiBase);
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
