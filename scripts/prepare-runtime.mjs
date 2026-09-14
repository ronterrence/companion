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
const env = { ...process.env };
// A PowerShell 7 parent can pass incompatible module paths to Windows PowerShell 5.
// Let the child shell initialize its own default module paths.
if (process.platform === 'win32') {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'psmodulepath') delete env[key];
  }
}
const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
