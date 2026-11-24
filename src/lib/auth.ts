import { ADMIN_HASHES, CONFIG } from '../config';
import { sessionGet, sessionRemove, sessionSet } from './storage';

export function detectAdminFlag(): boolean {
  const search = new URLSearchParams(window.location.search);
  if (search.get('admin') === '1') return true;

  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    const hashQuery = new URLSearchParams(hash.slice(queryIndex + 1));
    if (hashQuery.get('admin') === '1') return true;
  }

  return false;
}

export function grantAdminEntry(): void {
  sessionSet(CONFIG.storage.adminEntry, '1');
}

export function hasAdminEntry(): boolean {
  return sessionGet(CONFIG.storage.adminEntry) === '1';
}

export function readAdminSession(): boolean {
  const raw = sessionGet(CONFIG.storage.adminSession);
  if (!raw) return false;

  try {
    const data = JSON.parse(raw) as { expiresAt?: number };
    if (typeof data.expiresAt !== 'number' || data.expiresAt < Date.now()) {
      sessionRemove(CONFIG.storage.adminSession);
      return false;
    }
    return true;
  } catch {
    sessionRemove(CONFIG.storage.adminSession);
    return false;
  }
}

export function writeAdminSession(): void {
  sessionSet(
    CONFIG.storage.adminSession,
    JSON.stringify({ expiresAt: Date.now() + CONFIG.adminSessionTtlMs }),
  );
}

export function clearAdminSession(): void {
  sessionRemove(CONFIG.storage.adminSession);
}

export async function verifyAdmin(login: string, password: string): Promise<boolean> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SECURE CONTEXT REQUIRED (HTTPS OR LOCALHOST)');
  }

  const input = new TextEncoder().encode(`${login.trim().toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return ADMIN_HASHES.includes(hash);
}
