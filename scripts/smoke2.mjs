import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = candidates.find((path) => existsSync(path));
if (!executablePath) throw new Error('Chrome/Edge not found');

const base = 'http://127.0.0.1:4173';
const logPath = 'smoke.log';
writeFileSync(logPath, '');

function log(name, result = {}, errors = []) {
  const line = JSON.stringify({ name, ...result, errors });
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
});

async function scenario(name, path, selector, action) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector(selector, { timeout: 20000 });
    const result = await action(page);
    log(name, result, errors);
  } catch (error) {
    log(name, { error: error instanceof Error ? error.message : String(error) }, errors);
  } finally {
    await page.close().catch(() => {});
  }
}

// Вход в кабинет — только три нажатия подряд по верхней плашке.
async function tripleTapHeader(page) {
  const header = page.locator('.app-header img');

  for (let index = 0; index < 3; index += 1) {
    await header.click({ position: { x: 12, y: 12 } });
    await page.waitForTimeout(120);
  }
}

await scenario('catalog', '/', '.product-card', async (page) => ({
  cards: await page.locator('.product-card').count(),
  quickOrderButtons: await page.locator('.card-order-btn').count(),
  floatingAdminButton: await page.locator('#adminBtn').count(),
  manifest: await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null),
}));

await scenario('detail-order-modal', '/', '.product-card', async (page) => {
  await page.locator('.product-card').first().click();
  await page.waitForSelector('.detail-photo');
  await page.locator('.order-btn').click();
  await page.waitForSelector('.modal-overlay');
  const title = await page.locator('.modal-content h3').innerText();
  await page.locator('.modal-content .btn-cancel').last().click();
  return { title };
});

await scenario('detail', '/#/item/ua-001', '.order-btn', async (page) => ({
  title: await page.locator('.detail-name').first().innerText(),
  orderButton: await page.locator('.order-btn').first().innerText(),
  photos: await page.locator('.detail-photo').count(),
  slides: await page.locator('.detail-carousel-slide').count(),
}));

await scenario('search', '/#/search', '.search-input', async (page) => {
  await page.locator('.search-input').fill('jacket');
  await page.waitForTimeout(400);
  return { cards: await page.locator('.product-card').count() };
});

await scenario('archive', '/#/archive', '.archive-grid', async (page) => ({
  items: await page.locator('.archive-item').count(),
}));

await scenario('admin-single-tap', '/', '.product-card', async (page) => {
  await page.locator('.app-header img').click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(400);
  return { login: await page.locator('#admin-login').count() };
});

await scenario('admin-triple-tap', '/', '.product-card', async (page) => {
  await tripleTapHeader(page);
  await page.waitForSelector('#admin-login', { timeout: 5000 });
  return {
    login: await page.locator('#admin-login').count(),
    password: await page.locator('#admin-password').count(),
    hash: await page.evaluate(() => window.location.hash),
  };
});

await scenario('admin-login', '/', '.product-card', async (page) => {
  await tripleTapHeader(page);
  await page.waitForSelector('#admin-login', { timeout: 5000 });
  await page.locator('#admin-login').fill('admin1');
  await page.locator('#admin-password').fill(process.env.ADMIN1_PASS ?? '');
  await page.locator('.save-btn').click();
  await page.waitForSelector('.admin-add-btn', { timeout: 20000 });
  return {
    header: await page.locator('.screen-header').first().innerText(),
    rows: await page.locator('.admin-product-row').count(),
    apiField: await page.locator('#admin-api-base').count(),
  };
});

await scenario('catalog-after-scroll', '/', '.product-card', async (page) => {
  await page.evaluate(() => {
    const area = document.querySelector('.scroll-area');
    if (area) area.scrollTop = 400;
  });
  await page.waitForTimeout(400);
  return { floatingAdminButton: await page.locator('#adminBtn').count() };
});

await scenario('admin-entry-after-scroll', '/', '.product-card', async (page) => {
  await page.evaluate(() => {
    const area = document.querySelector('.scroll-area');
    if (area) area.scrollTop = 400;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const area = document.querySelector('.scroll-area');
    if (area) area.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  await tripleTapHeader(page);
  await page.waitForSelector('#admin-login', { timeout: 5000 });
  return { login: await page.locator('#admin-login').count() };
});

await scenario('pwa', '/', '.product-card', async (page) => {
  const serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return registration ? 'registered' : 'not-registered';
  });

  return {
    serviceWorker,
    manifest: await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null),
  };
});

await browser.close();
