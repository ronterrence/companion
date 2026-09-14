import { chromium } from '@playwright/test';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve('website-dist');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(root, 'index.html')).href);
  await page.getByRole('heading', { name: /A little space/ }).waitFor();
  await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
  for (const name of await page.locator('img').evaluateAll(images => images.map(i => i.getAttribute('src')))) await access(resolve(root, name));
  for (const link of await page.locator('a[download]').evaluateAll(links => links.map(a => a.getAttribute('href')))) await access(resolve(root, link));
  await page.addScriptTag({ content: await readFile('node_modules/axe-core/axe.min.js', 'utf8') });
  const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ') + ' ' + n.failureSummary).join('; ')}`));
  if (axe.length) throw new Error(axe.join('\n'));
  await page.screenshot({ path: 'src-tauri/target/website-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Website overflows mobile viewport.');
  await page.screenshot({ path: 'src-tauri/target/website-mobile.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Website desktop/mobile layout, WCAG checks, screenshot files and download links passed.');
} finally { await browser.close(); }
