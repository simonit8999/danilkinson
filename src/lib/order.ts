import { CONFIG } from '../config';
import type { Product } from '../types';
import { copyText } from './clipboard';

export function composeOrderMessage(product: Product, comment: string): string {
  const link = `${window.location.href.split('#')[0]}#/item/${encodeURIComponent(product.id)}`;

  return [
    `${CONFIG.brand} / ORDER`,
    `ITEM: ${product.name}`,
    `PRICE: ${product.price}`,
    `LINK: ${link}`,
    `COMMENT: ${comment.trim() || '—'}`,
  ].join('\n');
}

export function openTelegramOrder(text: string): boolean {
  const url = `https://t.me/${CONFIG.telegramUsername}?text=${encodeURIComponent(text)}`;
  const win = window.open(url, '_blank');
  if (!win) return false;

  try {
    win.opener = null;
  } catch {
    // ignore
  }

  return true;
}

export async function sendOrder(
  product: Product,
  comment: string,
): Promise<'opened' | 'copied' | 'failed'> {
  const text = composeOrderMessage(product, comment);

  if (openTelegramOrder(text)) return 'opened';
  if (await copyText(text)) return 'copied';
  return 'failed';
}
