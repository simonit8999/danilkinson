/**
 * Проверка публикации каталога:
 *   npm run check:publish
 *
 * Поднимает копию server/index.mjs во временной папке (реальные данные не
 * трогаются), логинится тестовым админом, отправляет PUT /api/catalog и
 * проверяет, что обновились оба файла:
 *   server/data/products.json        — рабочий store сервера
 *   public/data/products.json        — статическая копия для GitHub Pages
 *
 * Именно вторая копия раньше отставала: сервер писал «ONLINE», а покупатели
 * на Pages видели старый каталог.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP = { 'ngrok-skip-browser-warning': '1' };
const MARKER = `TEST PRODUCT ${Date.now()}`;

const work = await mkdtemp(join(tmpdir(), 'ua-publish-'));
let child = null;
let failed = false;

const ok = (label, pass, extra = '') => {
  if (!pass) failed = true;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
};

try {
  // Копия проекта: сервер считает ROOT от собственного расположения.
  await mkdir(join(work, 'server'), { recursive: true });
  await mkdir(join(work, 'shared'), { recursive: true });
  await mkdir(join(work, 'public', 'data'), { recursive: true });
  await cp(join(ROOT, 'server', 'index.mjs'), join(work, 'server', 'index.mjs'));
  await cp(
    join(ROOT, 'public', 'data', 'products.json'),
    join(work, 'public', 'data', 'products.json'),
  );

  // Тестовый админ: реальный shared/admin-hashes.json не читаем.
  const hash = createHash('sha256').update('test:test').digest('hex');
  await writeFile(join(work, 'shared', 'admin-hashes.json'), JSON.stringify([hash]), 'utf8');

  child = spawn(process.execPath, [join('server', 'index.mjs')], {
    cwd: work,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: 'ignore',
  });

  await waitForHealth();

  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { ...SKIP, 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'test', password: 'test' }),
  });
  const { token } = await login.json();
  ok('POST /api/login', login.ok && typeof token === 'string', `status ${login.status}`);

  const products = [
    {
      id: 'ua-test-1',
      name: MARKER,
      price: '$ 1',
      images: ['https://example.com/1.png'],
      description: 'check',
      soldOut: false,
      archived: false,
    },
    {
      id: 'ua-test-2',
      name: 'SECOND PRODUCT',
      price: '$ 2',
      images: [],
      cover: 'https://example.com/2.png',
      description: '',
      soldOut: true,
      archived: false,
    },
  ];

  const put = await fetch(`${BASE}/api/catalog`, {
    method: 'PUT',
    headers: { ...SKIP, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(products),
  });
  ok('PUT /api/catalog', put.ok, `status ${put.status}`);

  const store = await readProducts(join(work, 'server', 'data', 'products.json'));
  ok('server/data/products.json updated', hasMarker(store));

  const published = await readProducts(join(work, 'public', 'data', 'products.json'));
  ok('public/data/products.json updated (GitHub Pages)', hasMarker(published));

  const catalog = await (await fetch(`${BASE}/api/catalog`, { headers: SKIP })).json();
  ok('GET /api/catalog returns saved catalog', hasMarker(catalog.products));
} catch (error) {
  failed = true;
  console.log(`FAIL ${error.message}`);
} finally {
  if (child) {
    child.kill();
    await new Promise((done) => {
      const timer = setTimeout(done, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  }
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    .catch(() => {});
}

if (failed) {
  console.log('\nPUBLISH CHECK FAILED');
  process.exit(1);
}

console.log('\nALL CHECKS PASSED');

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`, { headers: SKIP });
      if (response.ok) return;
    } catch {
      // сервер ещё стартует
    }
    await new Promise((done) => setTimeout(done, 200));
  }

  throw new Error(`server did not start on ${BASE}`);
}

async function readProducts(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function hasMarker(list) {
  return Array.isArray(list) && list.some((item) => item.name === MARKER);
}
