import { cp, mkdir, readFile, copyFile, writeFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
for (const name of ['home.png', 'setup.png']) await access(resolve(root, 'website/screenshots', name));
const artifacts = [
  [`src-tauri/target/release/bundle/nsis/Companion Studio_${version}_x64-setup.exe`, `Companion-Studio-${version}-x64-setup.exe`],
  [`src-tauri/target/release/bundle/msi/Companion Studio_${version}_x64_en-US.msi`, `Companion-Studio-${version}-x64.msi`],
];
for (const [source] of artifacts) await access(resolve(root, source));
const output = resolve(root, 'website-dist');
await mkdir(resolve(output, 'downloads'), { recursive: true });
await cp(resolve(root, 'website'), output, { recursive: true });
let page = await readFile(resolve(output, 'index.html'), 'utf8');
page = page.replaceAll('0.3.0', version); await writeFile(resolve(output, 'index.html'), page);
const sums = [];
for (const [source, filename] of artifacts) {
  const target = resolve(output, 'downloads', filename); await copyFile(resolve(root, source), target);
  const hash = createHash('sha256'); for await (const chunk of createReadStream(target)) hash.update(chunk);
  sums.push(`${hash.digest('hex')}  ${filename}`);
}
await writeFile(resolve(output, 'downloads/SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log(`Prepared website-dist with screenshots and verified ${version} download files. Nothing published.`);
