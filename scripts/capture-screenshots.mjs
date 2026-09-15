import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('heading', { name: 'Create AI companions you can trust.' }).waitFor();
  await mkdir('website/screenshots', { recursive: true });
  await page.screenshot({ path: 'website/screenshots/home.png', fullPage: true });
  // Capture the production React setup component with a deterministic, unconfigured native bridge.
  // This is a UI fixture: it cannot download models, save credentials, or transmit chat content.
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async (command) => {
      if (command === 'get_engine_status') return { setupComplete: false, engine: 'prototype', baseUrl: null, model: null, hasKey: false,
        local: { state: 'not-installed', downloaded: 0, total: 428970080, installed: false, error: null, availableRam: 8589934592 },
        catalog: { name: 'Qwen3 0.6B — basic local model', license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE', revision: 'b5f37287796e5be0ea3dab2e7430873fb3f73e49', size: 428970080, runtime: 'llama.cpp b10025 CPU x64' } };
      if (command === 'list_companions') return [];
      throw new Error('Screenshot fixture does not perform native operations.');
    } };
  });
  await page.reload();
  await page.getByRole('heading', { name: 'How would you like to run your AI?' }).waitFor();
  await page.screenshot({ path: 'website/screenshots/setup.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflows) throw new Error('Setup overflows the narrow viewport.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured home and setup screens; narrow setup layout and browser errors checked.');
} finally { await browser.close(); }
