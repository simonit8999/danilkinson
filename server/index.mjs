/**
 * Локальный сервер каталога: отдаёт собранный сайт (dist) и API.
 *
 * Запуск:
 *   npm run build
 *   npm run server          (http://127.0.0.1:3000)
 *   npm run tunnel          (ngrok http 3000)
 *
 * Данные: server/data/products.json (создаётся из public/data/products.json).
 * Доступ на запись: токен, который выдаёт POST /api/login после сверки
 * SHA-256 хеша пары login:password со списком shared/admin-hashes.json.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile?.();
} catch {
  // .env не обязателен
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATA_DIR = join(ROOT, 'server', 'data');
const STORE = join(DATA_DIR, 'products.json');
const BACKUPS = join(DATA_DIR, 'backups');
// Статическая копия каталога: её читают покупатели на GitHub Pages, где нет /api/*.
const PUBLIC_DATA = join(ROOT, 'public', 'data', 'products.json');
// Битый/отсутствующий store восстанавливаем из последней публикации.
const SEED = PUBLIC_DATA;
const HASHES_FILE = join(ROOT, 'shared', 'admin-hashes.json');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 2 * 1024 * 1024;
const TOKEN_TTL = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW = 5 * 60 * 1000;
const LOGIN_LIMIT = 10;
const BACKUPS_KEEP = 30;
const API_VERSION = '2';

const PLACEHOLDER = 'https://picsum.photos/id/100/600/600';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const tokens = new Map();
const attempts = new Map();

let hashes = [];
try {
  const parsed = JSON.parse(await readFile(HASHES_FILE, 'utf8'));
  hashes = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
} catch (error) {
  console.warn('[server] cannot read shared/admin-hashes.json', error);
}
if (!hashes.length) console.warn('[server] no admin hashes: write access will be rejected');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!(await isFile(STORE))) {
    await copyFile(SEED, STORE);
    console.log('[server] catalog created from public/data/products.json');
  }
}

async function readProductsFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readLatestBackup() {
  try {
    const files = (await readdir(BACKUPS))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();

    for (const name of files) {
      const products = await readProductsFile(join(BACKUPS, name));
      if (products) return products;
    }
  } catch {
    // бэкапов ещё нет
  }

  return null;
}

/**
 * Каталог с диска. Битый/отсутствующий файл восстанавливаем: сначала последний
 * бэкап, затем public/data/products.json. Функция не бросает исключений,
 * чтобы /api/health и /api/catalog всегда отвечали.
 */
async function readStore() {
  const products = await readProductsFile(STORE);

  if (products) {
    const info = await stat(STORE);
    return { products, updatedAt: info.mtime.toISOString() };
  }

  const backup = await readLatestBackup();
  const restored = backup ?? (await readProductsFile(SEED)) ?? [];

  console.warn(
    backup
      ? '[server] store is unreadable: restored from backups'
      : '[server] store is unreadable: restored from public/data/products.json',
  );

  await writeStore(restored).catch((error) => console.error('[server] cannot restore store', error));
  return { products: restored, updatedAt: new Date().toISOString() };
}

async function pruneBackups() {
  const files = (await readdir(BACKUPS)).filter((name) => name.endsWith('.json')).sort();
  const extra = files.slice(0, Math.max(0, files.length - BACKUPS_KEEP));
  await Promise.all(extra.map((name) => unlink(join(BACKUPS, name))));
}

async function writeStore(products) {
  const temp = `${STORE}.tmp`;
  const json = JSON.stringify(products, null, 2);
  await writeFile(temp, json, 'utf8');
  await rename(temp, STORE);

  await mkdir(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(BACKUPS, `${stamp}.json`), json, 'utf8');
  await pruneBackups().catch(() => {});

  await mirrorStatic(json);
}

/**
 * Обновляет статическую копию каталога в репозитории.
 *
 * GitHub Pages не умеет читать /api/*, поэтому клиенты Pages берут
 * public/data/products.json. Раньше файл обновлялся только вручную
 * (`npm run publish`), и правки админки до покупателей не доезжали:
 * сервер писал «ONLINE», а на Pages оставался старый каталог.
 * Теперь копия обновляется при каждом сохранении и ждёт commit + push.
 */
async function mirrorStatic(json) {
  try {
    const current = await readFile(PUBLIC_DATA, 'utf8').catch(() => null);
    if (current === json) return false;

    await mkdir(dirname(PUBLIC_DATA), { recursive: true });
    await writeFile(PUBLIC_DATA, json, 'utf8');
    console.log(
      '[server] catalog copy updated: public/data/products.json'
      + ' (commit + push to refresh the static GitHub Pages fallback)',
    );
    return true;
  } catch (error) {
    console.warn('[server] cannot update public/data/products.json', error);
    return false;
  }
}

function validateProducts(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 500) return null;

  const products = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const price = typeof item.price === 'string' ? item.price.trim() : '';
    if (!name || !price) return null;

    const images = Array.isArray(item.images)
      ? item.images.filter((value) => typeof value === 'string' && value.trim()).slice(0, 12)
      : [];
    const cover = typeof item.cover === 'string' && item.cover.trim()
      ? item.cover.trim()
      : undefined;

    products.push({
      id: String(item.id || `ua-${products.length + 1}`),
      name,
      price,
      images: images.length ? images : (cover ? [] : [PLACEHOLDER]),
      ...(cover ? { cover } : {}),
      description: typeof item.description === 'string' ? item.description : '',
      soldOut: item.soldOut === true,
      archived: item.archived === true,
    });
  }

  return products;
}

function issueToken() {
  const token = randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL);
  return token;
}

function isToken(value) {
  const expires = tokens.get(value);
  if (!expires) return false;
  if (expires < Date.now()) {
    tokens.delete(value);
    return false;
  }
  return true;
}

function allowLogin(ip) {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now - record.start > LOGIN_WINDOW) {
    attempts.set(ip, { start: now, count: 1 });
    return true;
  }

  record.count += 1;
  return record.count <= LOGIN_LIMIT;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, ngrok-skip-browser-warning',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  // Кэшируем preflight на 10 минут: ngrok и браузер меньше дёргают OPTIONS.
  res.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function cacheControlFor(filePath, name) {
  if (name === 'index.html' || name === 'sw.js' || name === 'manifest.json') {
    return 'no-cache';
  }

  // Собранные Vite-файлы содержат хеш в имени — их можно кешировать надолго.
  if (filePath.includes(`${sep}assets${sep}`)) {
    return 'public, max-age=31536000, immutable';
  }

  // Фото и прочую статику могут заменить под тем же именем:
  // no-cache + ETag заставляет браузер перепроверять файл (ответ 304 дешёвый).
  return 'no-cache';
}

async function serveFile(req, res, filePath) {
  if (!(await isFile(filePath))) return false;

  const info = await stat(filePath);
  const name = basename(filePath);
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;

  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', info.mtime.toUTCString());
  res.setHeader('Cache-Control', cacheControlFor(filePath, name));

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch) {
    const matched = ifNoneMatch.trim() === '*'
      || ifNoneMatch.split(',').some((value) => value.trim() === etag);

    if (matched) {
      res.writeHead(304);
      res.end();
      return true;
    }
  } else {
    const ifModifiedSince = req.headers['if-modified-since'];
    if (typeof ifModifiedSince === 'string') {
      const since = Date.parse(ifModifiedSince);
      if (!Number.isNaN(since) && Math.floor(info.mtimeMs / 1000) * 1000 <= since) {
        res.writeHead(304);
        res.end();
        return true;
      }
    }
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';

  const target = resolve(DIST, rel);
  if (target !== DIST && !target.startsWith(DIST + sep)) return false;

  if (await isFile(target)) return serveFile(req, res, target);
  if (extname(rel)) return false;

  return serveFile(req, res, join(DIST, 'index.html'));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (pathname.startsWith('/api/')) {
    console.log(`[api] ${req.method} ${pathname}`);
  }

  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/health') {
      cors(res);
      const { products, updatedAt } = await readStore();
      sendJson(res, 200, {
        ok: true,
        version: API_VERSION,
        count: products.length,
        updatedAt,
      });
      return;
    }

    // /api/products — алиас /api/catalog для старых версий клиента.
    const isCatalog = pathname === '/api/catalog' || pathname === '/api/products';

    if (isCatalog && req.method === 'GET') {
      cors(res);
      const { products, updatedAt } = await readStore();
      sendJson(res, 200, { products, updatedAt });
      return;
    }

    if (pathname === '/data/products.json') {
      cors(res);
      const { products } = await readStore();
      sendJson(res, 200, products);
      return;
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      cors(res);
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (!allowLogin(ip)) {
        sendJson(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'BAD_JSON' });
        return;
      }

      const login = String(payload?.login ?? '').trim().toLowerCase();
      const password = String(payload?.password ?? '');
      if (!login || !password) {
        sendJson(res, 400, { error: 'MISSING_CREDENTIALS' });
        return;
      }

      if (!hashes.includes(sha256(`${login}:${password}`))) {
        sendJson(res, 401, { error: 'INVALID_CREDENTIALS' });
        return;
      }

      sendJson(res, 200, { token: issueToken() });
      return;
    }

    if (isCatalog && req.method === 'PUT') {
      cors(res);
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!isToken(token)) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return;
      }

      if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) {
        sendJson(res, 413, { error: 'TOO_LARGE' });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'BAD_JSON' });
        return;
      }

      const products = validateProducts(payload);
      if (!products) {
        sendJson(res, 422, { error: 'INVALID_CATALOG' });
        return;
      }

      await writeStore(products);
      sendJson(res, 200, { updatedAt: new Date().toISOString(), count: products.length });
      return;
    }

    // Неизвестный /api/* обязан отвечать JSON-ом. Раньше сюда попадал
    // SPA-fallback (index.html со статусом 200), и клиент считал сервер живым,
    // но получал HTML вместо данных.
    if (pathname.startsWith('/api/')) {
      cors(res);
      sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    if (await serveStatic(req, res, pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('NOT FOUND');
  } catch (error) {
    console.error('[server]', req.method, pathname, error);
    if (!res.headersSent) sendJson(res, 500, { error: 'SERVER_ERROR' });
    else res.end();
  }
});

/**
 * Если ngrok уже запущен — показываем актуальный публичный адрес.
 * Его вставляют в админке в поле API BASE, когда сайт открыт не с сервера
 * (например с GitHub Pages), чтобы не пересобирать проект.
 */
async function logPublicUrl(attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels', {
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json();
      const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
      const https = tunnels.find((item) => String(item.public_url ?? '').startsWith('https://'));
      const publicUrl = https?.public_url ?? tunnels[0]?.public_url;

      if (publicUrl) {
        console.log(`[server] tunnel url: ${publicUrl}`);
        console.log('[server] admin -> API BASE: paste this url if the site is opened on GitHub Pages');
        return;
      }
    } catch {
      // ngrok ещё не поднялся — попробуем через 5 секунд
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
  }
}

await ensureStore();

if (!(await isFile(join(DIST, 'index.html')))) {
  console.warn('[server] dist/index.html not found: run "npm run build" first');
}

server.listen(PORT, HOST, () => {
  console.log(`[server] catalog + site: http://${HOST}:${PORT}`);
  console.log('[server] tunnel: npm run tunnel  (ngrok http 127.0.0.1:3000)');
  console.log('[server] every save also updates public/data/products.json (GitHub Pages fallback)');
  void logPublicUrl();
});
