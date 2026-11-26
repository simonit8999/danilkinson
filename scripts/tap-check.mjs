/**
 * Проверка входа в кабинет без внешних зависимостей (headless Chrome/Edge + CDP):
 *   node scripts/tap-check.mjs                       # http://127.0.0.1:3000/
 *   node scripts/tap-check.mjs http://127.0.0.1:4173
 *
 * Проверяет три вещи:
 *   1. плавающей кнопки [ ADMIN ] (#adminBtn) нет в DOM;
 *   2. одно нажатие по верхней плашке кабинет не открывает;
 *   3. три нажатия подряд открывают экран ADMIN со входом.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:3000/';
const cdpPort = 9333;

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executable = candidates.find((path) => existsSync(path));

if (!executable) {
  console.error('Chrome/Edge не найден');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'ua-tap-'));
const browser = spawn(executable, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`,
  url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const targets = await response.json();
      // Ждём именно страницу с HTTP-адресом: в момент старта Chrome может
      // отдать about:blank, и первый Runtime.evaluate оборвётся при навигации.
      const page = targets.find((item) => (
        item.type === 'page'
        && item.webSocketDebuggerUrl
        && /^https?:/i.test(item.url ?? '')
      ));
      if (page) return page;
    } catch {
      // браузер ещё стартует
    }
    await sleep(250);
  }
  throw new Error('CDP: страница не найдена');
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

// Даём браузеру завершить первый переход: Runtime.evaluate в момент
// навигации обрывается с "Execution context was destroyed".
await sleep(1200);

let seq = 0;
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

try {
  const ready = await evaluate(`new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.querySelector('.product-card')) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  })`);

  if (!ready) throw new Error('каталог не отрисовался');

  const floating = await evaluate("document.querySelectorAll('#adminBtn').length");

  const clickHeader = () => evaluate("document.querySelector('.app-header img').click()");

  await clickHeader();
  await sleep(400);
  const afterOneTap = await evaluate("document.querySelectorAll('#admin-login').length");

  // Каждое нажатие — отдельный вызов: после перехода на /admin контекст
  // страницы может пересоздаться, и один длинный Promise оборвётся.
  for (let tap = 0; tap < 2; tap += 1) {
    await clickHeader();
    await sleep(200);
  }

  await sleep(600);
  const afterTripleTap = await evaluate("document.querySelectorAll('#admin-login').length");
  const hash = await evaluate('window.location.hash');

  console.log(JSON.stringify({
    url,
    floatingAdminButtons: floating,
    loginAfterOneTap: afterOneTap,
    loginAfterTripleTap: afterTripleTap,
    hash,
  }, null, 2));

  const pass = floating === 0 && afterOneTap === 0 && afterTripleTap === 1;
  console.log(pass ? 'TAP_CHECK_OK' : 'TAP_CHECK_FAILED');
  if (!pass) process.exitCode = 1;
} finally {
  socket.close();
  browser.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
