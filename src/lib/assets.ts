import { readApiBase } from './apiBase';

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Приводит путь к картинке к рабочему адресу.
 *
 * Каталог может прийти с сервера (GitHub Pages + туннель), но фото в нём
 * записаны как ./images/products/name.png. На Pages такой путь ищет файл
 * на github.io, поэтому относительные пути нужно резолвить от адреса API.
 * Абсолютные URL (https://…) и data:/blob: не трогаем.
 */
export function resolveAssetUrl(source: string): string {
  const value = source.trim();
  if (!value) return value;
  if (ABSOLUTE.test(value)) return value;

  const base = readApiBase();
  if (!base) return value;

  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    return value;
  }
}
