import { execSync, spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = process.cwd();

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9333',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${ROOT}/.tmp-chrome4`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--window-size=390,844',
    'http://127.0.0.1:3000/#/item/ua-mwxhdude',
  ],
  { stdio: 'ignore' },
);

process.on('exit', () => {
  try {
    execSync(`taskkill /PID ${chrome.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* уже остановлен */
  }
});

const waitHttp = async (url, timeout = 25000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timeout: ${url}`);
};

await waitHttp('http://127.0.0.1:3000/');
await waitHttp('http://127.0.0.1:9333/json/version');
console.log('site + chrome ready');

await import('./cdp.mjs');
