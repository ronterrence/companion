// Offline desktop-bridge fixture. No keys, models, or provider requests are used.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { const file = extname(path) ? path : resolve(root, 'index.html'); response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const profiles = [{ id: 'fixture', name: 'DeepSeek fixture', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', limits: null, testedAt: null }];
    const state = { setupComplete: true, engine: 'api', baseUrl: profiles[0].baseUrl, model: profiles[0].model, hasKey: true, profiles, selectedProfile: 'fixture', models: [{ id: 'deepseek-flash', provider: 'deepseek', limits: { context: 1000000, output: 128000 }, thinking: 'deepseek', qualification: 'documented; live qualification pending' }], local: { state: 'not-installed', downloaded: 0, total: 428970080, installed: false, error: null, availableRam: 8589934592 }, catalog: { name: 'Qwen3 basic', license: 'Apache-2.0', licenseUrl: '', revision: 'fixture', size: 428970080, runtime: 'fixture' } };
    let permission = false;
    const messages = []; const sessions = []; const requests = [];
    window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
      if (command === 'get_engine_status') return state;
      if (command === 'list_companions' || command === 'list_memories') return [];
      if (command === 'save_session') { sessions.push(args.session); return; }
      if (command === 'list_sessions') return sessions;
      if (command === 'save_message') { messages.push(args.message); return; }
      if (command === 'list_messages') return messages.filter(m => m.sessionId === args.sessionId);
      if (command === 'append_audit') return;
      if (command === 'begin_chat' || command === 'end_chat') { permission = false; return; }
      if (command === 'authorize_chat') { permission = args.allow; return; }
      if (command === 'provider_activity') return requests;
      if (command === 'get_provider_result') return requests.find(r => r.id === args.id) ?? null;
      if (command === 'get_chat_context') return { summary: '', covered: 0, preferences: { length: 'standard', thinking: 'balanced' }, profileId: 'fixture', model: 'deepseek-flash', limits: null };
      if (command === 'choose_provider_profile') { permission = false; return; }
      if (command === 'assess_chat_context') return { estimatedInput: 100, availableInput: 900000, nearLimit: false, overLimit: false, summarized: false };
      if (command === 'run_provider_request') {
        if (!permission) throw new Error('Fixture requires consent.');
        const request = args.request; if (request.message) messages.push(request.message);
        const reply = { content: request.action === 'continue' ? 'The completed explanation.' : 'A helpful partial explanation.', status: request.action === 'continue' ? 'complete' : 'truncated', message: request.action === 'continue' ? null : 'Response limit reached.', usage: { input: 20, output: 30, reasoning: null, cached: null, cacheWrite: null, estimatedUsd: null, priceDate: null } };
        const result = { ...request, profileId: 'fixture', model: 'deepseek-flash', createdAt: new Date().toISOString(), reply };
        messages.push({ id: 'reply-' + request.id, sessionId: request.sessionId, role: 'assistant', content: reply.content, createdAt: new Date().toISOString(), provider: 'cloud' }); requests.push(result); return result;
      }
      throw new Error('Unsupported fixture operation: ' + command);
    } };
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Connect an API provider' }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/provider-settings.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 760, height: 900 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right })).slice(0, 15)));
    await page.screenshot({ path: 'test-results/provider-settings-narrow.png', fullPage: true });
    throw new Error('Settings overflow at minimum window width.');
  }
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: /Think through a problem/ }).click();
  const card = page.locator('.companion-card').filter({ has: page.getByRole('heading', { name: 'Root Cause Analyst' }) });
  await card.getByRole('button', { name: 'Review & Start' }).click();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.getByRole('button', { name: 'Allow API for this chat' }).click();
  await page.getByLabel('Thinking', { exact: true }).selectOption('quick');
  await page.getByLabel('Answer length').selectOption('detailed');
  await page.getByLabel('Message', { exact: true }).fill('Explain this topic');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('A helpful partial explanation.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Continue (may cost)', exact: true }).click();
  await page.getByText('The completed explanation.', { exact: false }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/provider-chat.png', fullPage: true, animations: 'disabled' });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Chat overflows at minimum window width.');
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('button', { name: 'My Companions', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Allow API for this chat' }).waitFor();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Verified settings, minimum-width layout, consent, presets, truncation/continuation, and saved conversation recovery with an offline fixture.');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
