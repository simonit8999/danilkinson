/**
 * Проверка сервера каталога одной командой:
 *   npm run check
 *   npm run check -- https://ваш-домен.ngrok-free.dev
 *
 * По умолчанию проверяется http://127.0.0.1:3000 — тот адрес, который
 * отдаёт и сайт, и API.
 */
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const skipWarning = { 'ngrok-skip-browser-warning': '1' };

await check('GET /api/health', '/api/health');
await check('GET /api/catalog', '/api/catalog');
await check('GET /api/products (alias)', '/api/products');
await check('GET /api/unknown (404)', '/api/unknown', { expect: 404 });
await check('GET / (site)', '/');
await preflight();

async function check(label, path, { expect = 200, ...init } = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...skipWarning, ...(init.headers ?? {}) },
    });
    const body = await response.text();
    const pass = response.status === expect;
    const preview = body.slice(0, 100).replace(/\s+/g, ' ');

    console.log(
      `${pass ? 'OK  ' : 'FAIL'} ${label.padEnd(24)} ${response.status} `
      + `${response.headers.get('content-type') ?? ''} :: ${preview}`,
    );
  } catch (error) {
    console.log(`FAIL ${label.padEnd(24)} ${error.message}`);
  }
}

async function preflight() {
  try {
    const response = await fetch(`${base}/api/catalog`, {
      method: 'OPTIONS',
      headers: skipWarning,
    });

    console.log(
      `${response.status === 204 ? 'OK  ' : 'FAIL'} OPTIONS preflight        ${response.status} `
      + `allow-origin=${response.headers.get('access-control-allow-origin')} `
      + `max-age=${response.headers.get('access-control-max-age')}`,
    );
  } catch (error) {
    console.log(`FAIL OPTIONS preflight        ${error.message}`);
  }
}
