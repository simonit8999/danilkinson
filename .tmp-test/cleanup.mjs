import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';

const base = 'D:/Александр/Данилинсон';
console.log('exists:', existsSync(base));

if (existsSync(base)) {
  if (statSync(base).isDirectory()) {
    console.log('before:', readdirSync(base));
    rmSync(base, { recursive: true, force: true });
  }
}

console.log('removed:', !existsSync(base));
