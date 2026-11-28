/* Диагностика карусели в реальном Chrome через CDP. */
import { appendFileSync, writeFileSync } from 'node:fs';

const DEVTOOLS = 'http://127.0.0.1:9333';
const APP = 'http://127.0.0.1:3000/#/item/ua-mwxhdude';
const LOG = '.tmp-test/log.txt';
writeFileSync(LOG, '');
const log = (...parts) => appendFileSync(LOG, `${parts.join(' ')}\n`);
setTimeout(() => {
  log('GLOBAL TIMEOUT');
  process.exit(2);
}, 45000);

log('start');

let page;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const targets = await (await fetch(`${DEVTOOLS}/json/list`)).json();
  page = targets.find((t) => t.type === 'page');
  if (page) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!page) throw new Error('no app page target');
log('page target', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];

ws.addEventListener('error', (event) => log('ws error', String(event.message || event.type)));

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
    events.push(msg);
  }
});

await new Promise((resolve) => ws.addEventListener('open', resolve));
log('ws open');

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: APP });

const waitFor = async (expression, timeout = 15000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await evaluate(expression).catch(() => false);
    if (ok) return true;
    await sleep(200);
  }
  return false;
};

const loaded = await waitFor(`Boolean(document.querySelector('.detail-carousel-slide'))`);
log('loaded:', loaded);

const DIAG = `(() => {
  const fig = document.querySelector('.detail-photo');
  const track = document.querySelector('.detail-carousel-track');
  const slides = [...document.querySelectorAll('.detail-carousel-slide')];
  const arrows = [...document.querySelectorAll('.detail-carousel-arrow')];
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const screen = document.querySelector('.detail-screen');
  const container = document.querySelector('.container');
  const area = document.querySelector('.scroll-area');
  return {
    aria: fig && fig.getAttribute('aria-label'),
    ratioVar: fig && fig.style.getPropertyValue('--photo-ratio'),
    fig: rect(fig),
    figStyle: fig && { w: cs(fig).width, h: cs(fig).height, ar: cs(fig).aspectRatio, overflow: cs(fig).overflow, touchAction: cs(fig).touchAction, display: cs(fig).display },
    track: rect(track),
    trackStyle: track && { w: cs(track).width, h: cs(track).height, display: cs(track).display, transform: cs(track).transform, touchAction: cs(track).touchAction },
    slides: slides.map((s) => ({ rect: rect(s), flex: cs(s).flex, w: cs(s).width, h: cs(s).height })),
    imgs: slides.map((s) => rect(s.querySelector('img'))),
    arrows: arrows.map((a) => ({ rect: rect(a), opacity: cs(a).opacity, display: cs(a).display, visibility: cs(a).visibility })),
    dots: document.querySelectorAll('.detail-carousel-dot').length,
    activeDot: [...document.querySelectorAll('.detail-carousel-dot')].findIndex((d) => d.classList.contains('active')),
    touchActionChain: {
      area: area && cs(area).touchAction,
      container: container && cs(container).touchAction,
      screen: screen && cs(screen).touchAction,
      figure: fig && cs(fig).touchAction,
      track: track && cs(track).touchAction,
    },
  };
})()`;

const STATE = `(() => {
  const fig = document.querySelector('.detail-photo');
  const track = document.querySelector('.detail-carousel-track');
  return {
    aria: fig && fig.getAttribute('aria-label'),
    transform: track && getComputedStyle(track).transform,
    ratioVar: fig && fig.style.getPropertyValue('--photo-ratio'),
    activeDot: [...document.querySelectorAll('.detail-carousel-dot')].findIndex((d) => d.classList.contains('active')),
    scrollLeft: track && track.parentElement && track.parentElement.scrollLeft,
  };
})()`;

log('--- BEFORE ---');
log(JSON.stringify(await evaluate(DIAG), null, 2));

// Клик по стрелке «вперёд» настоящей мышью.
const arrow = await evaluate(`(() => {
  const a = document.querySelector('.detail-carousel-arrow-next');
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
log('arrow center:', arrow);

if (arrow) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: arrow.x, y: arrow.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: arrow.x, y: arrow.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: arrow.x, y: arrow.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  log('--- AFTER ARROW CLICK ---');
  log(JSON.stringify(await evaluate(STATE), null, 2));
}

// Свайп пальцем по фото (справа налево — к следующему фото).
const box = await evaluate(`(() => {
  const fig = document.querySelector('.detail-photo');
  const r = fig.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
})()`);
log('photo center:', box);

const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
  type,
  touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
});

await touch('touchStart', box.x + 100, box.y);
for (let step = 1; step <= 8; step += 1) {
  await touch('touchMove', box.x + 100 - step * 30, box.y);
  await sleep(16);
}
await touch('touchEnd', box.x - 140, box.y);
await sleep(1400);

log('--- AFTER SWIPE ---');
log(JSON.stringify(await evaluate(STATE), null, 2));

log('--- CONSOLE EVENTS ---');
for (const event of events.slice(-20)) {
  log(event.method, JSON.stringify(event.params).slice(0, 600));
}

ws.close();
process.exit(0);
