/**
 * Переносит «живой» каталог сервера в public/data/products.json.
 * После этого можно закоммитить файл — GitHub Pages пересоберётся.
 *
 *   npm run publish
 */
import { copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(ROOT, 'server', 'data', 'products.json');
const to = join(ROOT, 'public', 'data', 'products.json');

await copyFile(from, to);
console.log('[publish] server/data/products.json -> public/data/products.json');
