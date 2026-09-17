import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

assert(process.platform === 'darwin' && process.arch === 'arm64', 'Verification requires Apple silicon macOS.');
const root = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(root, 'src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Companion Studio.app');
const runtimeOnly = process.argv.includes('--runtime');
const artifact = process.argv.includes('--artifact');
assert(!(runtimeOnly && artifact), 'Choose either runtime or artifact verification.');
const expectedVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 60_000 }).trim();

function verifyBinary(binary) {
  accessSync(binary, constants.X_OK);
  assert.equal(run('/usr/bin/lipo', ['-archs', binary]), 'arm64', `Wrong architecture: ${binary}`);
  const commands = run('/usr/bin/otool', ['-l', binary]);
  const minimum = commands.match(/\bminos\s+(\d+(?:\.\d+)*)/)?.[1]
    ?? commands.match(/LC_VERSION_MIN_MACOSX\s+cmdsize\s+\d+\s+version\s+(\d+(?:\.\d+)*)/)?.[1];
  const parts = minimum?.split('.').map(Number) ?? [];
  const version = (parts[0] ?? Infinity) * 65536 + (parts[1] ?? 0) * 256 + (parts[2] ?? 0);
  assert(version <= 13 * 65536, `macOS baseline exceeded: ${binary}: ${minimum}`);
  // All non-system code is statically linked; no Homebrew/build-machine dependencies.
  for (const line of run('/usr/bin/otool', ['-L', binary]).split('\n').slice(1)) {
    const dependency = line.trim().split(' (')[0];
    assert(dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/Library/'),
      `Unbundled dependency: ${dependency}`);
  }
  run('/usr/bin/codesign', ['--verify', '--strict', binary]);
}

function verifyRuntime(runtime) {
  assert(!readdirSync(runtime).some(name => /\.(exe|dll|dylib)$/.test(name)), 'Mixed-platform or unexpected dynamic runtime files.');
  const server = join(runtime, 'llama-server');
  verifyBinary(server);
  accessSync(join(runtime, 'LICENSE-llama.cpp.txt'));
  accessSync(join(runtime, 'licenses'));
  run(server, ['--version']);
}

function verifyApp(app) {
  verifyRuntime(join(app, 'Contents/Resources/runtime'));
  verifyBinary(join(app, 'Contents/MacOS/companion-studio'));
  accessSync(join(app, 'Contents/Resources/model-catalog.json'));
  const plist = join(app, 'Contents/Info.plist');
  assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', plist]), '13.0');
  assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]), expectedVersion);
  assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist]), expectedVersion);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
}

if (artifact) {
  const directory = resolve(root, 'src-tauri/target/aarch64-apple-darwin/release/bundle/dmg');
  const name = `Companion Studio_${expectedVersion}_aarch64.dmg`;
  assert.deepEqual(readdirSync(directory).filter(file => /\.dmg$/i.test(file)), [name], 'Expected exactly one versioned ARM64 DMG.');
  const manifest = readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8').trim();
  const entry = manifest.match(/^([a-fA-F0-9]{64})  (?:\.\/)?([^\r\n]+)$/);
  assert(entry && entry[2] === name, 'Checksum manifest must contain exactly the expected DMG.');
  const digest = run('/usr/bin/shasum', ['-a', '256', join(directory, name)]).slice(0, 64);
  assert.equal(entry[1].toLowerCase(), digest.toLowerCase(), 'DMG checksum mismatch.');
  const info = readFileSync(join(directory, 'BUILD-INFO.txt'), 'utf8');
  const field = key => info.split(/\r?\n/).filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1));
  assert.deepEqual(field('product'), ['Companion Studio']);
  assert.deepEqual(field('version'), [expectedVersion]);
  assert.deepEqual(field('qualification_status'), ['awaiting_hardware_verification']);
  if (process.env.GITHUB_SHA) assert.deepEqual(field('source_commit'), [process.env.GITHUB_SHA]);
  if (process.env.GITHUB_RUN_ATTEMPT) assert.deepEqual(field('workflow_run_attempt'), [process.env.GITHUB_RUN_ATTEMPT]);
  if (process.env.GITHUB_RUN_ID) {
    assert.deepEqual(field('workflow_run'), [`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`]);
  }
  const mount = mkdtempSync(join(tmpdir(), 'companion-dmg-'));
  let attached = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, join(directory, name)]);
    attached = true;
    assert.deepEqual(readdirSync(mount).filter(file => file.endsWith('.app')), ['Companion Studio.app']);
    verifyApp(join(mount, 'Companion Studio.app'));
  } finally {
    if (attached) run('/usr/bin/hdiutil', ['detach', mount]);
    rmdirSync(mount);
  }
} else if (runtimeOnly) {
  verifyRuntime(join(root, 'src-tauri/runtime'));
} else {
  verifyApp(app);
}
console.log(`Verified ${artifact ? 'DMG, checksum, metadata, and enclosed app' : runtimeOnly ? 'runtime' : 'app bundle'}: ARM64, macOS deployment target, system-only dependencies, executable permissions, and signatures.`);
