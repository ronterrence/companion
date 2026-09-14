import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.platform === 'win32' ? 'powershell' : 'bash';
const args = process.platform === 'win32'
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/prepare-runtime.ps1']
  : ['scripts/prepare-runtime-macos.sh'];
if (process.platform !== 'win32' && !(process.platform === 'darwin' && process.arch === 'arm64')) {
  throw new Error('Bundled runtime preparation supports Windows and Apple silicon macOS only.');
}
const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
