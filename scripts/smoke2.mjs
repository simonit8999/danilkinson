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

await scenario('catalog', '/', '.product-card', async (page) => ({
  cards: await page.locator('.product-card').count(),
  cardButtons: await page.locator('.card-order-btn').count(),
  adminButton: await page.locator('#adminBtn').count(),
  manifest: await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null),
}));

await scenario('card-order-modal', '/', '.product-card', async (page) => {
  await page.locator('.card-order-btn').first().click();
  await page.waitForSelector('.modal-overlay');
  const title = await page.locator('.modal-content h3').innerText();
  await page.locator('.modal-content .btn-cancel').last().click();
  return { title };
});

await scenario('detail', '/#/item/ua-001', '.order-btn', async (page) => ({
  title: await page.locator('.screen-header').first().innerText(),
  orderButton: await page.locator('.order-btn').first().innerText(),
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

await scenario('admin-gate', '/?admin=1#/admin', '#admin-login', async (page) => ({
  login: await page.locator('#admin-login').count(),
  password: await page.locator('#admin-password').count(),
  adminButton: await page.locator('#adminBtn').count(),
}));

await scenario('admin-login', '/?admin=1#/admin', '#admin-login', async (page) => {
  await page.locator('#admin-login').fill('admin1');
  await page.locator('#admin-password').fill(process.env.ADMIN1_PASS ?? '');
  await page.locator('.save-btn').click();
  await page.waitForSelector('.admin-add-btn', { timeout: 20000 });
  return {
    header: await page.locator('.screen-header').first().innerText(),
    rows: await page.locator('.admin-product-row').count(),
  };
});

await scenario('catalog-after-scroll', '/', '.product-card', async (page) => {
  await page.evaluate(() => {
    const area = document.querySelector('.scroll-area');
    if (area) area.scrollTop = 400;
  });
  await page.waitForTimeout(400);
  return { adminButton: await page.locator('#adminBtn').count() };
});

await scenario('admin-entry-after-scroll', '/?admin=1#/', '.product-card', async (page) => {
  await page.evaluate(() => {
    const area = document.querySelector('.scroll-area');
    if (area) area.scrollTop = 400;
  });
  await page.waitForTimeout(400);
  return { adminButton: await page.locator('#adminBtn').count() };
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
