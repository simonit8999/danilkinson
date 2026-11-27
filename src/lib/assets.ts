import { isServerReachable } from './api';
import { readApiBase } from './apiBase';

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Приводит путь к картинке к рабочему адресу.
 *
 * Каталог может прийти с сервера (GitHub Pages + туннель), но фото в нём
 * записаны как ./images/products/name.png. На Pages такой путь ищет файл
 * на github.io, поэтому относительные пути нужно резолвить от адреса API.
 * Абсолютные URL (https://…) и data:/blob: не трогаем.
 *
 * Если сервер недоступен (показан статический public/data/products.json),
 * относительные пути снова считаются от самого сайта — иначе при выключенном
 * сервере фото искались бы на мёртвом домене туннеля.
 */
export function resolveAssetUrl(source: string): string {
  const value = source.trim();
  if (!value) return value;
  if (ABSOLUTE.test(value)) return value;

  const base = isServerReachable() ? readApiBase() : '';
  if (!base) return value;

  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    return value;
  }
}
