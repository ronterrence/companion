import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { digest, inspectArtifact, parseChecksums, validateRun } from './release-assets.mjs';
import { verifyDownloads } from './verify-downloads.mjs';

// Explicit promotion only: ordinary builds never replace public downloads.
const [runId, artifactRoot] = process.argv.slice(2);
assert(/^\d+$/.test(runId ?? '') && artifactRoot, 'Usage: npm run prepare:downloads -- RUN_ID ARTIFACT_DIRECTORY');
const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
assert(/^\d+\.\d+\.\d+$/.test(version));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert(!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(), 'Commit source changes before preparing a release');
const run = JSON.parse(execFileSync('gh', ['run', 'view', runId, '--repo', 'ronterrence/companion', '--json', 'attempt,headSha,status,conclusion,url,jobs'], { encoding: 'utf8' }));
validateRun(run, sourceCommit);
const windows = await inspectArtifact(join(resolve(artifactRoot), 'windows'), [`Companion Studio_${version}_x64-setup.exe`, `Companion Studio_${version}_x64_en-US.msi`], version, run);
const mac = await inspectArtifact(join(resolve(artifactRoot), 'macos'), [`Companion Studio_${version}_aarch64.dmg`], version, run, true);
const files = [
  { name: `Companion-Studio-${version}-x64-setup.exe`, bytes: windows.files[0].bytes },
  { name: `Companion-Studio-${version}-x64.msi`, bytes: windows.files[1].bytes },
  { name: `Companion-Studio-${version}_aarch64.dmg`, bytes: mac.files[0].bytes },
  { name: `Companion-Studio-${version}-macos-BUILD-INFO.txt`, bytes: mac.metadataBytes },
  { name: `Companion-Studio-${version}-windows-BUILD-INFO.txt`, bytes: windows.metadataBytes },
];
const stage = join(root, 'test-results', `website-release-${Date.now()}`);
await mkdir(stage, { recursive: true });
await cp(join(root, 'website'), stage, { recursive: true });
const manifest = parseChecksums(await readFile(join(stage, 'downloads/SHA256SUMS.txt'), 'utf8'));
for (const file of files) {
  const hash = digest(file.bytes);
  assert(!manifest.has(file.name) || manifest.get(file.name) === hash, `Refusing to replace different bytes at an existing release URL: ${file.name}`);
  await writeFile(join(stage, 'downloads', file.name), file.bytes);
  manifest.set(file.name, hash);
}
await writeFile(join(stage, 'downloads/SHA256SUMS.txt'), [...manifest].map(([name, hash]) => `${hash}  ${name}\n`).join(''));
let html = await readFile(join(stage, 'index.html'), 'utf8');
assert(/<section id="download"[\s\S]*?<\/section>/.test(html), 'Download section missing');
html = html.replace(/<section id="download"[\s\S]*?<\/section>/, `<section id="download" class="download"><div><p class="eyebrow">Your next step</p><h2>Make room<br>for a clearer thought.</h2><p>Companion Studio · Preview release</p><p class="fine">The installers include the local runtime. The optional model downloads inside the app. Windows installers are unsigned. Live-provider qualification is pending for both platforms.</p><p>Provider profiles for OpenAI, Claude, DeepSeek, and custom connections; reply and thinking controls; saved chats and encrypted summaries.</p></div><div class="download-actions">
<div class="platform-download"><strong>Windows <span id="windows-version">${version}</span></strong><span>Windows 10/11 · x64</span><a class="primary" id="installer" href="downloads/${files[0].name}" download>Download Windows installer ↓</a><a href="downloads/${files[1].name}" download>Windows MSI installer</a><a href="downloads/${files[4].name}" download>Windows build information</a></div>
<div class="platform-download"><strong>macOS <span id="macos-version">${version}</span> — unqualified preview</strong><span>Targets macOS 13+ · Apple silicon (M-series)</span><p class="fine" id="mac-qualification">This unqualified preview is ad-hoc signed and unnotarized. Automated checks passed. Real-Mac installation, Metal acceleration, upgrade behavior, installed-app Keychain checks, and live-provider qualification remain pending.</p><a class="primary" href="downloads/${files[2].name}" download>Download unqualified Mac preview ↓</a><a href="downloads/${files[3].name}" download>Mac build information</a><p class="fine" id="mac-first-open">Open the DMG and drag Companion Studio into Applications. If macOS blocks first open, attempt to launch it, then use System Settings → Privacy &amp; Security → Open Anyway. <a href="https://support.apple.com/en-us/102445">Apple’s first-open instructions</a>. Do not disable Gatekeeper globally.</p></div>
<a href="downloads/SHA256SUMS.txt" download>Verify downloads (SHA-256)</a><p class="fine">Linux and mobile apps are not available in this release.</p></div></section>`);
html = html.replace('Connect an OpenAI-compatible Chat Completions API using its base URL, model name, and your key.', 'Save separate OpenAI, Claude, DeepSeek, or custom provider connections using your own keys.');
html = html.replace('CPU runtime included in the installer', 'Local runtime included; Mac Metal support awaits hardware qualification');
await writeFile(join(stage, 'index.html'), html);
await writeFile(join(stage, 'release.json'), JSON.stringify({ version, sourceCommit, workflowRun: run.url, workflowRunAttempt: run.attempt, macQualification: 'awaiting_hardware_verification', macMetadata: files[3].name, files: files.map(file => ({ name: file.name, sha256: digest(file.bytes) })) }, null, 2) + '\n');
console.log(await verifyDownloads(stage));
// No public changes until all artifacts and the complete staged site pass validation.
for (const file of files) await cp(join(stage, 'downloads', file.name), join(root, 'website/downloads', file.name));
for (const name of ['downloads/SHA256SUMS.txt', 'index.html', 'release.json']) await cp(join(stage, name), join(root, 'website', name));
console.log(`Prepared ${version} from ${sourceCommit}. Commit website assets to publish; no deployment has been triggered by this command.`);
