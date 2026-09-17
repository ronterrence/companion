import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, parseChecksums, parseMetadata, validateRun, inspectArtifact } from './release-assets.mjs';
import { verifyDownloads } from './verify-downloads.mjs';

const run = { status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40), attempt: 2, url: 'https://github.com/ronterrence/companion/actions/runs/123', jobs: ['web', 'rust', 'Apple silicon preview'].map(name => ({ name, conclusion: 'success' })) };
test('failed, incomplete, wrong-commit, or missing-job CI cannot authorize publication', () => {
  validateRun(run, run.headSha);
  for (const change of [{ status: 'in_progress' }, { conclusion: 'failure' }, { headSha: 'b'.repeat(40) }, { jobs: run.jobs.slice(1) }]) assert.throws(() => validateRun({ ...run, ...change }, run.headSha));
});
test('website validation catches missing, stale, and corrupt linked downloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-website-test-'));
  const name = 'Companion-Studio-0.4.0-x64-setup.exe';
  const bytes = Buffer.from('fixture installer');
  const html = `<strong id="version">0.4.0</strong><a href="downloads/${name}" download>Download</a>`;
  try {
    await mkdir(join(directory, 'downloads'));
    await writeFile(join(directory, 'index.html'), html);
    await writeFile(join(directory, 'downloads/SHA256SUMS.txt'), `${digest(bytes)}  ${name}\n`);
    await assert.rejects(() => verifyDownloads(directory), /ENOENT/);
    await writeFile(join(directory, 'downloads', name), bytes);
    await verifyDownloads(directory);
    await writeFile(join(directory, 'index.html'), html.replace('>0.4.0<', '>0.3.0<'));
    await assert.rejects(() => verifyDownloads(directory), /version mismatch/);
    await writeFile(join(directory, 'index.html'), html);
    await writeFile(join(directory, 'downloads', name), 'corrupt');
    await assert.rejects(() => verifyDownloads(directory), /checksum mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('checksum parser accepts shasum output but rejects traversal and duplicates', () => {
  assert.equal(parseChecksums(`${'a'.repeat(64)}  ./Companion Studio.dmg\n`).get('Companion Studio.dmg'), 'a'.repeat(64));
  for (const name of ['../app.dmg', '..\\app.dmg', '/app.dmg']) assert.throws(() => parseChecksums(`${'a'.repeat(64)}  ${name}`));
  assert.throws(() => parseChecksums(`${'a'.repeat(64)}  app.dmg\n${'b'.repeat(64)}  app.dmg`));
  assert.throws(() => parseMetadata('version=0.4.0\nversion=0.3.0'));
});
test('artifact validation rejects tampering, wrong versions, attempts, qualification, and extra payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-release-test-'));
  const name = 'Companion Studio_0.4.0_aarch64.dmg';
  const bytes = Buffer.from('fixture DMG');
  const metadata = `product=Companion Studio\nversion=0.4.0\nsource_commit=${run.headSha}\nworkflow_run=${run.url}\nworkflow_run_attempt=2\nqualification_status=awaiting_hardware_verification\n`;
  const check = () => inspectArtifact(directory, [name], '0.4.0', run, true);
  try {
    await writeFile(join(directory, name), bytes);
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${digest(bytes)}  ./${name}\n`);
    await writeFile(join(directory, 'BUILD-INFO.txt'), metadata);
    assert.deepEqual((await check()).files[0].bytes, bytes);
    await writeFile(join(directory, name), 'tampered');
    await assert.rejects(check, /Checksum mismatch/);
    await writeFile(join(directory, name), bytes);
    for (const altered of [metadata.replace('version=0.4.0', 'version=0.3.0'), metadata.replace('attempt=2', 'attempt=1'), metadata.replace('awaiting_hardware_verification', 'qualified')]) {
      await writeFile(join(directory, 'BUILD-INFO.txt'), altered);
      await assert.rejects(check);
    }
    await writeFile(join(directory, 'BUILD-INFO.txt'), metadata);
    await writeFile(join(directory, 'old.dmg'), bytes);
    await assert.rejects(check, /Unexpected artifact contents/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
