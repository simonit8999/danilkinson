import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const add = args.includes('--add');
const [login, password] = args.filter((value) => !value.startsWith('--'));

if (!login || !password) {
  console.error('Usage: node scripts/hash-admin.mjs <login> <password> [--add]');
  process.exit(1);
}

const hash = createHash('sha256')
  .update(`${login.trim().toLowerCase()}:${password}`)
  .digest('hex');

console.log(hash);

if (add) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, 'shared', 'admin-hashes.json');
  const list = JSON.parse(await readFile(file, 'utf8'));

  if (!Array.isArray(list)) throw new Error('shared/admin-hashes.json must be an array');
  if (!list.includes(hash)) {
    list.push(hash);
    await writeFile(file, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    console.log('added to shared/admin-hashes.json');
  } else {
    console.log('hash already in shared/admin-hashes.json');
  }
}

