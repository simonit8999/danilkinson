/**
 * Переносит «живой» каталог сервера в public/data/products.json.
 * После этого можно закоммитить файл — GitHub Pages пересоберётся.
 *
 *   npm run publish
 */
import { copyFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(ROOT, 'server', 'data', 'products.json');
const to = join(ROOT, 'public', 'data', 'products.json');

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const products = JSON.parse(await readFile(from, 'utf8'));
const missing = [];

// На GitHub Pages относительные пути ./images/products/... ищут файл
// в репозитории. Если его там нет — у посетителей будет битое фото.
for (const product of Array.isArray(products) ? products : []) {
  const sources = [
    product?.cover,
    ...(Array.isArray(product?.images) ? product.images : []),
  ];

  for (const source of sources) {
    if (typeof source !== 'string' || !source.trim()) continue;

    const value = source.trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;

    const relative = value.replace(/^\.?\//, '').split(/[?#]/)[0];
    if (!(await isFile(join(ROOT, 'public', relative)))) {
      missing.push(`${product.id ?? '(no id)'}: ${value}`);
    }
  }
}

await copyFile(from, to);
console.log('[publish] server/data/products.json -> public/data/products.json');

if (missing.length) {
  console.warn('[publish] relative images not found in public/ — GitHub Pages will show them broken:');
  for (const line of [...new Set(missing)]) console.warn(`  ${line}`);
  console.warn('[publish] put the files into public/images/products/ and commit them too.');
}
