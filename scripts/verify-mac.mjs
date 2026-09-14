import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

assert(process.platform === 'darwin' && process.arch === 'arm64', 'Verification requires Apple silicon macOS.');
const root = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(root, 'src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Companion Studio.app');
const runtimeOnly = process.argv.includes('--runtime');
const runtime = runtimeOnly ? join(root, 'src-tauri/runtime') : join(app, 'Contents/Resources/runtime');
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

assert(!readdirSync(runtime).some(name => /\.(exe|dll|dylib)$/.test(name)), 'Mixed-platform or unexpected dynamic runtime files.');
const server = join(runtime, 'llama-server');
verifyBinary(server);
accessSync(join(runtime, 'LICENSE-llama.cpp.txt'));
accessSync(join(runtime, 'licenses'));
run(server, ['--version']);
if (!runtimeOnly) {
  verifyBinary(join(app, 'Contents/MacOS/companion-studio'));
  accessSync(join(app, 'Contents/Resources/model-catalog.json'));
  assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', join(app, 'Contents/Info.plist')]), '13.0');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
}
console.log(`Verified ${runtimeOnly ? 'runtime' : 'app bundle'}: ARM64, macOS deployment target, system-only dependencies, executable permissions, and signatures.`);
