import { cp, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const name of ['home.png', 'setup.png']) await access(resolve(root, 'website/screenshots', name));
const output = resolve(root, 'website-dist');
await mkdir(output, { recursive: true });
await cp(resolve(root, 'website'), output, { recursive: true });
console.log('Prepared website-dist from the committed public website assets. Nothing is published.');
