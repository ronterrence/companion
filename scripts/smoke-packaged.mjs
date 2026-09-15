import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
const folder = resolve('src-tauri/target/package-review/PFiles/Companion Studio');
await access(resolve(folder, 'runtime/llama-server.exe'));
await access(resolve(folder, 'runtime/llama-server-impl.dll'));
await access(resolve(folder, 'runtime/llama.dll'));
const exe = resolve(folder, 'companion-studio.exe').replaceAll("'", "''");
const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'; $appProcess = Start-Process -FilePath '${exe}' -WindowStyle Hidden -PassThru; $appProcess.Id`], { encoding: 'utf8', windowsHide: true });
const pid = Number(output.trim());
if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Could not identify packaged app process.');
let browser;
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9223'); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!browser) throw new Error('Packaged WebView did not expose its test connection.');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState('domcontentloaded');
  const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_engine_status'));
  if (!status.setupComplete) {
    await page.getByRole('heading', { name: 'How would you like to run your AI?' }).waitFor();
    await page.screenshot({ path: 'src-tauri/target/packaged-setup.png', fullPage: true });
  }
  console.log('Packaged app launched; native status IPC succeeded; bundled runtime files present. No setup choices or API requests made.');
} finally {
  if (browser) await browser.close();
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Stop-Process -Id ${pid} -ErrorAction SilentlyContinue`], { windowsHide: true });
}
