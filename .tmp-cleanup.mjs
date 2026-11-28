import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';

const root = process.cwd();
const self = '.tmp-cleanup.mjs';
let removed = 0;

for (const name of readdirSync(root)) {
  if (!name.startsWith('.tmp') || name === self) continue;

  const path = `${root}/${name}`;
  rmSync(path, { recursive: true, force: true });
  removed += 1;
  console.log(existsSync(path) ? `FAILED ${name}` : `removed ${name}`);
}

console.log(`removed entries: ${removed}`);
rmSync(`${root}/${self}`, { force: true });
