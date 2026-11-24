import { createHash } from 'node:crypto';

const [login, password] = process.argv.slice(2);

if (!login || !password) {
  console.error('Usage: node scripts/hash-admin.mjs <login> <password>');
  process.exit(1);
}

const hash = createHash('sha256')
  .update(`${login.trim().toLowerCase()}:${password}`)
  .digest('hex');

console.log(hash);
