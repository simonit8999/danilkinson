import type { Product } from '../types';

export const PLACEHOLDER_IMAGE = 'https://picsum.photos/id/100/600/600';

export function isSafeImageUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (/^javascript:/i.test(url)) return false;
  return /^(https?:\/\/|data:image\/|\/|\.{1,2}\/)/i.test(url)
    || /^[\w.-]+\//.test(url);
}

export function parseImages(raw: unknown): string[] {
  let list: string[] = [];

  if (Array.isArray(raw)) {
    list = raw.filter((item): item is string => typeof item === 'string');
  } else if (typeof raw === 'string') {
    list = raw.split(/[\n,]+/);
  }

  const images = list
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(isSafeImageUrl);

  return images.length ? images : [PLACEHOLDER_IMAGE];
}

export function formatPrice(value: number): string {
  return `€ ${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

export function normalizeProduct(raw: unknown, index: number): Product | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, unknown>;
  const name = String(data.name ?? data.title ?? '').trim();
  if (!name) return null;

  const price = typeof data.price === 'number'
    ? formatPrice(data.price)
    : String(data.price ?? '').trim();

  const soldOut = data.soldOut === true
    || data.soldOut === 1
    || data.soldOut === 'true'
    || data.soldOut === '1'
    || data.status === 'sold';

  const archived = data.archived === true
    || data.archived === 1
    || data.archived === 'true'
    || data.archived === '1';

  return {
    id: String(data.id ?? `ua-${index + 1}`),
    name,
    price,
    images: parseImages(data.images ?? data.image),
    description: String(data.description ?? data.desc ?? ''),
    soldOut,
    archived,
  };
}

export function normalizeProducts(raw: unknown): Product[] {
  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const products = (raw as { products?: unknown }).products;
    if (Array.isArray(products)) list = products;
  }

  return list
    .map((item, index) => normalizeProduct(item, index))
    .filter((product): product is Product => product !== null);
}

export function sortProducts(list: Product[]): Product[] {
  return [...list].sort((a, b) => Number(a.soldOut) - Number(b.soldOut));
}

export function newProductId(): string {
  return `ua-${Date.now().toString(36)}`;
}

export function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}
