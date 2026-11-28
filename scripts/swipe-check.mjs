/**
 * Проверка свайпов и карусели фото в headless Chrome через CDP.
 * Внешние зависимости не нужны (Playwright/Puppeteer не требуются):
 *
 *   npm run build
 *   node scripts/swipe-check.mjs
 *
 * Скрипт сам поднимает статический сервер над dist/ и отдаёт тестовый
 * каталог: товар с тремя фото (карусель) и товар с одним фото.
 *
 * Мобильный сценарий (iPhone 13: 390x844, touch):
 *   - свайпы между вкладками CATALOG / ARCHIVE / SEARCH / HELP;
 *   - свайп вправо из карточки товара закрывает её;
 *   - свайп по карусели листает фото и НЕ закрывает карточку;
 *   - стрелки и точки карусели переключают фото.
 *
 * Настольный сценарий (мышь):
 *   - перетаскивание мышью не переключает вкладки и не закрывает карточку;
 *   - клики по карточке, стрелкам и BACK работают.
 *
 * Результат: swipe-check.log + swipe-check-report.json.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.SWIPE_PORT || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const CDP_PORT = Number(process.env.SWIPE_CDP_PORT || 9455);
const LOG_PATH = join(ROOT, 'swipe-check.log');
const REPORT_PATH = join(ROOT, 'swipe-check-report.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- тестовые данные

function svg(width, height, color, label) {
  const markup = '<svg xmlns="http://www.w3.org/2000/svg"'
    + ' width="' + width + '" height="' + height + '"'
    + ' viewBox="0 0 ' + width + ' ' + height + '">'
    + '<rect width="100%" height="100%" fill="' + color + '"/>'
    + '<text x="50%" y="50%" dy=".35em" text-anchor="middle"'
    + ' font-family="Arial" font-size="120" fill="#ffffff">' + label + '</text>'
    + '</svg>';

  return 'data:image/svg+xml,' + encodeURIComponent(markup);
}

const PHOTO_1 = svg(900, 600, '#b5422c', '1');
const PHOTO_2 = svg(600, 900, '#2f5f8f', '2');
const PHOTO_3 = svg(900, 900, '#3f6b3f', '3');
const PHOTO_SINGLE = svg(800, 800, '#5a4a7a', 'S');

const LONG_DESCRIPTION = 'Тестовое описание для проверки вертикальной прокрутки. '.repeat(30);

const TEST_PRODUCTS = [
  {
    id: 'test-multi',
    name: 'TEST CAROUSEL',
    price: '€ 1',
    images: [PHOTO_1, PHOTO_2, PHOTO_3],
    cover: PHOTO_1,
    description: LONG_DESCRIPTION,
    soldOut: false,
    archived: false,
  },
  {
    id: 'test-single',
    name: 'TEST SINGLE PHOTO',
    price: '€ 2',
    images: [PHOTO_SINGLE],
    cover: PHOTO_SINGLE,
    description: LONG_DESCRIPTION,
    soldOut: false,
    archived: false,
  },
  {
    id: 'test-archive',
    name: 'TEST ARCHIVE ITEM',
    price: '€ 3',
    images: [PHOTO_SINGLE],
    cover: PHOTO_SINGLE,
    description: 'archive',
    soldOut: true,
    archived: true,
  },
  // Ещё несколько товаров: каталог должен быть выше вьюпорта, чтобы
  // проверить вертикальную прокрутку и отсутствие конфликта с drag.
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `test-extra-${index + 1}`,
    name: `TEST EXTRA ${index + 1}`,
    price: '€ 9',
    images: [PHOTO_SINGLE],
    cover: PHOTO_SINGLE,
    description: 'extra',
    soldOut: false,
    archived: false,
  })),
];

// ---------------------------------------------------------------- статический сервер

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', BASE);

    const sendJson = (payload) => {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify(payload));
    };

    if (url.pathname === '/api/health') return sendJson({ ok: true });
    if (url.pathname === '/api/catalog') {
      return sendJson({ products: TEST_PRODUCTS, updatedAt: new Date().toISOString() });
    }
    if (url.pathname === '/data/products.json') return sendJson(TEST_PRODUCTS);

    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = relative && extname(relative)
      ? join(DIST, relative)
      : join(DIST, 'index.html');

    try {
      const file = readFileSync(filePath);
      response.writeHead(200, {
        'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(file);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------- Chrome + CDP

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function launchChrome(profile) {
  const executable = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!executable) throw new Error('Chrome/Edge не найден');

  return spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-extensions',
    '--mute-audio',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
}

let socket;
let sequence = 0;
const pending = new Map();
const pageErrors = [];

function send(method, params = {}) {
  const id = ++sequence;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);

    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  const started = Date.now();

  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const targets = await response.json();
      const page = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);

      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        });

        socket.addEventListener('message', (event) => {
          const message = JSON.parse(event.data);

          if (message.id && pending.has(message.id)) {
            const task = pending.get(message.id);
            pending.delete(message.id);

            if (message.error) task.reject(new Error(message.error.message));
            else task.resolve(message.result);
            return;
          }

          if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            pageErrors.push(details?.exception?.description || details?.text || 'exception');
          }

          if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            pageErrors.push(
              message.params.args
                .map((arg) => arg.value ?? arg.description ?? '')
                .join(' '),
            );
          }
        });

        return;
      }
    } catch {
      // Chrome ещё стартует
    }

    await sleep(200);
  }

  throw new Error('CDP: страница не найдена');
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Runtime.evaluate failed',
    );
  }

  return result.result?.value;
}

async function waitFor(expression, timeout, label) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // контекст страницы мог пересоздаться при навигации
    }
    await sleep(100);
  }

  throw new Error(`timeout: ${label || expression}`);
}

// HashRouter на главной не добавляет «#»: пустая строка — это каталог.
const hash = () => evaluate('window.location.hash || "#/"');

async function rect(selector) {
  return evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      cx: box.x + box.width / 2,
      cy: box.y + box.height / 2,
    };
  })()`);
}

async function touchSwipe(x1, y1, x2, y2, { steps = 10, stepDelay = 20 } = {}) {
  const point = (x, y) => ({ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 });

  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(x1, y1)],
  });

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio)],
    });
    await sleep(stepDelay);
  }

  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function touchTap(x, y) {
  const point = { x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 };
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function mouseDrag(x1, y1, x2, y2, steps = 12) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x1,
    y: y1,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1 + (x2 - x1) * ratio,
      y: y1 + (y2 - y1) * ratio,
      button: 'left',
      buttons: 1,
    });
    await sleep(16);
  }

  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x2,
    y: y2,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

async function mouseClick(x, y) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

// ---------------------------------------------------------------- сценарии

const results = [];

function record(name, pass, details = {}) {
  results.push({ name, pass, ...details });
  const line = `${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(details)}`;
  appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
  return pass;
}

async function emulationMobile() {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
  });
}

async function emulationDesktop() {
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 800,
  });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'Windows',
  });
}

async function installPointerSpy() {
  await evaluate(`(() => {
    window.__spy = [];
    const types = [
      'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'touchstart', 'touchmove', 'touchend', 'click',
    ];

    types.forEach((type) => {
      document.addEventListener(type, (event) => {
        if (window.__spy.length >= 140) return;
        const touch = event.touches && event.touches[0];
        window.__spy.push({
          type,
          pointerType: event.pointerType || null,
          isPrimary: typeof event.isPrimary === 'boolean' ? event.isPrimary : null,
          x: Math.round(event.clientX || (touch ? touch.clientX : 0)),
          y: Math.round(event.clientY || (touch ? touch.clientY : 0)),
          target: String(event.target && (event.target.className || event.target.tagName) || ''),
        });
      }, { capture: true, passive: true });
    });

    return true;
  })()`);
}

/** Диагностика: приходят ли touch -> pointer события и двигается ли контейнер. */
async function debugTabSwipe() {
  await openCatalog();
  await installPointerSpy();

  // Куда попадёт палец в начале жеста (до возможной навигации).
  const hit = await evaluate(
    "String(document.elementFromPoint(330, 250)?.className || '')",
  );

  const transforms = [];
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 330, y: 250, id: 1 }],
  });

  for (let step = 1; step <= 8; step += 1) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 330 - step * 34, y: 250, id: 1 }],
    });
    await sleep(25);

    if (step === 4) {
      transforms.push(await evaluate("document.querySelector('.container').style.transform"));
    }
  }

  transforms.push(await evaluate("document.querySelector('.container').style.transform"));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);

  const debug = await evaluate(`(() => {
    const container = document.querySelector('.container');
    const box = container.getBoundingClientRect();

    return {
      events: window.__spy,
      transform: container.style.transform,
      hash: window.location.hash,
      touchAction: getComputedStyle(container).touchAction,
      pointerEventsSupported: 'PointerEvent' in window,
      innerWidth: window.innerWidth,
      containerBox: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    };
  })()`);

  const details = { transforms, ...debug };
  const events = Array.isArray(details.events) ? details.events : [];
  const count = (type) => events.filter((event) => event.type === type).length;

  record('мобильный ввод: touch → pointer, drag двигает контейнер', (
    count('pointerdown') === 1
    && count('pointermove') >= 4
    && count('pointercancel') === 0
    && transforms.some((value) => value && value !== 'none')
  ), {
    pointerdown: count('pointerdown'),
    pointermove: count('pointermove'),
    pointercancel: count('pointercancel'),
    transforms,
    hit,
  });
}


function photoState() {
  return evaluate(`(() => {
    const viewport = document.querySelector('.detail-carousel-viewport');
    const figure = document.querySelector('.detail-photo');
    const dots = [...document.querySelectorAll('.detail-carousel-dot')];
    const area = document.querySelector('.scroll-area');
    return {
      hash: window.location.hash,
      index: dots.findIndex((dot) => dot.classList.contains('active')),
      scrollLeft: viewport ? Math.round(viewport.scrollLeft) : null,
      slideWidth: viewport ? viewport.clientWidth : null,
      photoAspect: figure ? getComputedStyle(figure).aspectRatio : null,
      pageScrollTop: area ? Math.round(area.scrollTop) : null,
    };
  })()`);
}

async function openCatalog(fresh = true) {
  // fresh=true — полноценная перезагрузка документа: история навигации
  // очищается, и «назад» из карточки гарантированно ведёт в каталог.
  const suffix = fresh ? `?t=${Date.now()}` : '';
  await send('Page.navigate', { url: `${BASE}/${suffix}#/` });
  await waitFor("!!document.querySelector('.product-card')", 20000, 'каталог');
  await sleep(500);
}

async function swipeTab(direction, y = 250) {
  const fromX = direction === 'left' ? 330 : 60;
  const toX = direction === 'left' ? 60 : 330;
  await touchSwipe(fromX, y, toX, y, { steps: 8, stepDelay: 18 });
  await sleep(900);
  return hash();
}

async function tapCard(name) {
  const wanted = name ? JSON.stringify(name) : 'null';
  const card = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.product-card')];
    const value = ${wanted};
    const element = value
      ? cards.find((card) => card.textContent.includes(value))
      : cards[0];
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + Math.min(70, box.height / 2) };
  })()`);

  if (!card) throw new Error(`карточка «${name || 'первая'}» не найдена`);

  await touchTap(card.x, card.y);
  await waitFor(
    "window.location.hash.startsWith('#/item/') && !!document.querySelector('.detail-screen')",
    8000,
    'открытие карточки',
  );
  await sleep(600);
  return hash();
}

// ---------------------------------------------------------------- мобильные свайпы вкладок

async function testTabSwipes() {
  await openCatalog();

  const steps = [
    ['каталог → архив (свайп влево)', 'left', '#/archive'],
    ['архив → поиск (свайп влево)', 'left', '#/search'],
    ['поиск → помощь (свайп влево)', 'left', '#/help'],
    ['помощь → край (свайп влево не уводит дальше)', 'left', '#/help'],
    ['помощь → поиск (свайп вправо)', 'right', '#/search'],
    ['поиск → архив (свайп вправо)', 'right', '#/archive'],
    ['архив → каталог (свайп вправо)', 'right', '#/'],
  ];

  for (const [label, direction, expected] of steps) {
    const actual = await swipeTab(direction);
    record(label, actual === expected, { expected, actual });
  }

  // Горизонтальный drag вкладок не должен мешать вертикальной прокрутке.
  await evaluate("document.querySelector('.scroll-area').scrollTop = 0");
  await sleep(200);
  const before = await evaluate("Math.round(document.querySelector('.scroll-area').scrollTop)");
  await touchSwipe(200, 700, 200, 250, { steps: 10, stepDelay: 20 });
  await sleep(900);
  const after = await evaluate("Math.round(document.querySelector('.scroll-area').scrollTop)");
  record('каталог: вертикальный свайп прокручивает список', after > before + 80, {
    before,
    after,
  });
}

// ---------------------------------------------------------------- свайп «назад» из карточки

async function testDetailBackSwipe() {
  await openCatalog();
  const opened = await tapCard();
  record('карточка товара открывается тапом', opened === '#/item/test-multi', { opened });

  const description = await rect('.detail-description');
  const y = description
    ? Math.min(description.y + Math.min(description.height / 2, 40), 820)
    : 600;

  await touchSwipe(40, y, 340, y, { steps: 10, stepDelay: 18 });
  await sleep(1100);

  const actual = await hash();
  record('свайп вправо из карточки закрывает её', actual === '#/', { y, actual });
}

// ---------------------------------------------------------------- карусель фото

async function swipePhoto(direction, steps = 10, sampleHeight = false) {
  const photo = await rect('.detail-photo');
  const fromX = direction === 'left' ? photo.x + photo.width - 20 : photo.x + 20;
  const toX = direction === 'left' ? photo.x + 20 : photo.x + photo.width - 20;
  const y = photo.y + photo.height * 0.3;

  await touchSwipe(fromX, y, toX, y, { steps, stepDelay: 20 });

  const heightSamples = [];

  if (sampleHeight) {
    const started = Date.now();

    while (Date.now() - started < 1200) {
      heightSamples.push(await evaluate(
        "Math.round(document.querySelector('.detail-photo').getBoundingClientRect().height)",
      ));
      await sleep(50);
    }
  } else {
    await sleep(1200);
  }

  const state = await photoState();

  return sampleHeight ? { ...state, heightSamples } : state;
}

async function sampleScroll(action, timeout = 1400) {
  const samples = [];
  const started = Date.now();
  await action();

  while (Date.now() - started < timeout) {
    samples.push(await evaluate(
      "Math.round(document.querySelector('.detail-carousel-viewport')?.scrollLeft || 0)",
    ));
    await sleep(60);
  }

  return samples;
}

async function testCarousel() {
  await openCatalog();
  await tapCard();

  const geometry = await evaluate(`(() => {
    const viewport = document.querySelector('.detail-carousel-viewport');
    const track = document.querySelector('.detail-carousel-track');
    const figure = document.querySelector('.detail-photo');
    const screen = document.querySelector('.detail-screen');
    const container = document.querySelector('.container');
    const slides = [...document.querySelectorAll('.detail-carousel-slide')];
    const style = getComputedStyle(viewport);

    return {
      viewportWidth: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      slideWidths: slides.map((slide) => Math.round(slide.getBoundingClientRect().width * 10) / 10),
      imageWidths: slides.map((slide) => (
        Math.round(slide.querySelector('img').getBoundingClientRect().width)
      )),
      slideCount: slides.length,
      dotCount: document.querySelectorAll('.detail-carousel-dot').length,
      arrowCount: document.querySelectorAll('.detail-carousel-arrow').length,
      overflowX: style.overflowX,
      scrollSnapType: style.scrollSnapType,
      touchAction: style.touchAction,
      trackDisplay: getComputedStyle(track).display,
      photoAspect: figure ? getComputedStyle(figure).aspectRatio : null,
      screenTouchAction: screen ? getComputedStyle(screen).touchAction : null,
      containerTouchAction: container ? getComputedStyle(container).touchAction : null,
    };
  })()`);

  const widthOk = geometry.slideWidths.every(
    (width) => Math.abs(width - geometry.viewportWidth) <= 1,
  );
  const imageWidthOk = geometry.imageWidths.every(
    (width) => Math.abs(width - geometry.viewportWidth) <= 1,
  );

  record('карусель: 5 слайдов (3 фото + 2 клона)', geometry.slideCount === 5, geometry);
  record('карусель: стрелки и точки на месте', geometry.arrowCount === 2 && geometry.dotCount === 3, {
    arrows: geometry.arrowCount,
    dots: geometry.dotCount,
  });
  record('карусель: overflow-x auto + scroll-snap', (
    geometry.overflowX === 'auto' && geometry.scrollSnapType.includes('x')
  ), {
    overflowX: geometry.overflowX,
    scrollSnapType: geometry.scrollSnapType,
  });
  record('карусель: трек остаётся flex', geometry.trackDisplay === 'flex', {
    trackDisplay: geometry.trackDisplay,
  });
  record('карусель: слайд = ширина карусели', widthOk, {
    viewportWidth: geometry.viewportWidth,
    slideWidths: geometry.slideWidths,
  });
  record('карусель: фото = 100% ширины слайда', imageWidthOk, {
    viewportWidth: geometry.viewportWidth,
    imageWidths: geometry.imageWidths,
  });

  // Свайп по фото: листает и не закрывает карточку.
  const first = await photoState();
  const second = await swipePhoto('left', 10, true);
  record('карусель: свайп влево переключает на фото 2', second.index === 1, { first, second });
  record('карусель: свайп по фото не закрывает карточку', second.hash === '#/item/test-multi', {
    hash: second.hash,
  });
  record('карусель: высота галереи меняется плавно', (
    new Set(second.heightSamples).size >= 4
  ), { heights: second.heightSamples });

  const third = await swipePhoto('left');
  record('карусель: свайп влево переключает на фото 3', third.index === 2, { third });

  const wrapped = await swipePhoto('left');
  record('карусель: с фото 3 свайп влево возвращает фото 1', wrapped.index === 0, { wrapped });
  record('карусель: после клона лента стоит на настоящем слайде', (
    wrapped.scrollLeft !== null
    && wrapped.slideWidth !== null
    && Math.abs(wrapped.scrollLeft - wrapped.slideWidth) <= 2
  ), {
    scrollLeft: wrapped.scrollLeft,
    slideWidth: wrapped.slideWidth,
  });

  const backWrapped = await swipePhoto('right');
  record('карусель: с фото 1 свайп вправо возвращает фото 3', backWrapped.index === 2, {
    backWrapped,
  });

  record('карусель: --photo-ratio применён к контейнеру', (
    Boolean(geometry.photoAspect) && geometry.photoAspect !== 'auto'
  ), { photoAspect: geometry.photoAspect });
}
async function testCarouselControls() {
  await openCatalog();
  await tapCard();

  // Стрелки: плавный переход (scrollLeft меняется постепенно).
  const beforeNext = await photoState();
  const next = await rect('.detail-carousel-arrow-next');
  const nextSamples = await sampleScroll(() => touchTap(next.cx, next.cy));
  const afterNext = await photoState();
  const expectedNext = (beforeNext.index + 1) % 3;
  record('карусель: стрелка › переключает фото', afterNext.index === expectedNext, {
    before: beforeNext.index,
    after: afterNext.index,
    expected: expectedNext,
  });
  record('карусель: переход стрелкой › плавный', new Set(nextSamples).size >= 3, {
    samples: nextSamples,
  });

  const beforePrev = await photoState();
  const prev = await rect('.detail-carousel-arrow-prev');
  const prevSamples = await sampleScroll(() => touchTap(prev.cx, prev.cy));
  const afterPrev = await photoState();
  const expectedPrev = (beforePrev.index + 2) % 3;
  record('карусель: стрелка ‹ переключает фото', afterPrev.index === expectedPrev, {
    before: beforePrev.index,
    after: afterPrev.index,
    expected: expectedPrev,
  });
  record('карусель: переход стрелкой ‹ плавный', new Set(prevSamples).size >= 3, {
    samples: prevSamples,
  });

  // Точки.
  const dots = await evaluate(`[...document.querySelectorAll('.detail-carousel-dot')].map((dot) => {
    const box = dot.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })`);
  await touchTap(dots[1].x, dots[1].y);
  await sleep(1000);
  const afterDot = await photoState();
  record('карусель: точка переключает фото', afterDot.index === 1, { afterDot });

  // Вертикальный свайп по фото должен прокручивать страницу.
  await touchTap(dots[0].x, dots[0].y);
  await sleep(900);
  await evaluate("document.querySelector('.scroll-area').scrollTop = 0");
  await sleep(200);
  const photo = await rect('.detail-photo');
  await touchSwipe(
    photo.cx,
    photo.y + photo.height - 30,
    photo.cx,
    Math.max(80, photo.y + 40),
    { steps: 10, stepDelay: 20 },
  );
  await sleep(900);
  const scrollTop = await evaluate("Math.round(document.querySelector('.scroll-area').scrollTop)");
  record('карусель: вертикальный свайп по фото прокручивает страницу', scrollTop > 80, {
    scrollTop,
  });
}

// ---------------------------------------------------------------- одно фото

async function testSinglePhotoBack() {
  await openCatalog();
  const opened = await tapCard('TEST SINGLE PHOTO');
  record('товар с одним фото открывается', opened === '#/item/test-single', { opened });

  const photo = await rect('.detail-photo');
  await touchSwipe(40, photo.cy, 340, photo.cy, { steps: 10, stepDelay: 18 });
  await sleep(1100);

  const actual = await hash();
  record('свайп вправо по единственному фото закрывает карточку', actual === '#/', { actual });
}
// ---------------------------------------------------------------- ПК / мышь

async function testDesktop() {
  await emulationDesktop();
  await openCatalog();

  await mouseDrag(1000, 400, 200, 400);
  await sleep(700);
  const afterDrag = await hash();
  record('ПК: перетаскивание мышью не переключает вкладку', afterDrag === '#/', { afterDrag });

  const card = await rect('.product-card');
  await mouseClick(card.cx, card.y + 70);
  await waitFor("window.location.hash.startsWith('#/item/')", 8000, 'ПК: карточка товара');
  await sleep(600);

  const opened = await hash();
  record('ПК: клик по карточке открывает товар', opened === '#/item/test-multi', { opened });

  const description = await rect('.detail-description');
  await mouseDrag(150, description.y + 20, 900, description.y + 20);
  await sleep(700);

  const afterDesktopDrag = await hash();
  record('ПК: перетаскивание мышью не закрывает карточку', (
    afterDesktopDrag.startsWith('#/item/')
  ), { afterDesktopDrag });

  const arrows = await evaluate(`(() => {
    const prev = document.querySelector('.detail-carousel-arrow-prev');
    const next = document.querySelector('.detail-carousel-arrow-next');
    const photo = document.querySelector('.detail-photo');
    if (!prev || !next || !photo) return null;

    const nextBox = next.getBoundingClientRect();
    const prevBox = prev.getBoundingClientRect();
    const photoBox = photo.getBoundingClientRect();

    return {
      display: getComputedStyle(next).display,
      prevWidth: Math.round(prevBox.width),
      nextWidth: Math.round(nextBox.width),
      prevOnLeft: Math.abs(prevBox.x - photoBox.x) < 40,
      nextOnRight: Math.abs((nextBox.x + nextBox.width) - (photoBox.x + photoBox.width)) < 40,
      insidePhoto: (
        prevBox.y >= photoBox.y
        && nextBox.y + nextBox.height <= photoBox.y + photoBox.height
      ),
    };
  })()`);

  record('ПК: стрелки карусели видны по бокам', (
    Boolean(arrows)
    && arrows.display !== 'none'
    && arrows.prevWidth >= 30
    && arrows.nextWidth >= 30
    && arrows.prevOnLeft
    && arrows.nextOnRight
    && arrows.insidePhoto
  ), { arrows });

  const before = await photoState();
  const next = await rect('.detail-carousel-arrow-next');
  await mouseClick(next.cx, next.cy);
  await sleep(1000);
  const after = await photoState();
  record('ПК: клик по стрелке › переключает фото', after.index === (before.index + 1) % 3, {
    before: before.index,
    after: after.index,
  });

  await evaluate("document.querySelector('.detail-back').click()");
  await waitFor("window.location.hash === '#/'", 5000, 'ПК: возврат в каталог');
  record('ПК: кнопка BACK возвращает в каталог', (await hash()) === '#/', {
    hash: await hash(),
  });
}

// ---------------------------------------------------------------- запуск

async function main() {
  writeFileSync(LOG_PATH, '');

  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html не найден: сначала выполните npm run build');
    process.exitCode = 1;
    return;
  }

  const server = await startServer();
  const profile = mkdtempSync(join(tmpdir(), 'ua-swipe-'));
  let browser;

  try {
    browser = launchChrome(profile);
    await connect();
    await send('Page.enable');
    await send('Runtime.enable');

    await emulationMobile();
    await debugTabSwipe();
    await testTabSwipes();
    await testDetailBackSwipe();
    await testCarousel();
    await testCarouselControls();
    await testSinglePhotoBack();

    await testDesktop();
  } catch (error) {
    record('исключение в сценарии', false, {
      error: error instanceof Error ? (error.stack || error.message) : String(error),
    });
  } finally {
    try {
      socket?.close();
    } catch {
      // ignore
    }

    browser?.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(500);

    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome мог ещё держать файлы профиля
    }
  }

  const failed = results.filter((item) => !item.pass);
  const report = {
    date: new Date().toISOString(),
    passed: results.length - failed.length,
    failed: failed.length,
    pageErrors,
    results,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n${failed.length === 0 ? 'SWIPE_CHECK_OK' : 'SWIPE_CHECK_FAILED'} ${report.passed}/${results.length}`);
  if (failed.length > 0 || pageErrors.length > 0) process.exitCode = 1;
}

await main();



