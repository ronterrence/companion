import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseChecksums(text) {
  const result = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = line.match(/^([a-fA-F0-9]{64})  (?:\.\/)?(.+)$/);
    assert(match, 'Invalid checksum entry');
    const name = match[2];
    assert(name === basename(name) && !/[\\/]/.test(name) && !result.has(name), 'Unsafe or duplicate checksum filename');
    result.set(name, match[1].toLowerCase());
  }
  return result;
}
export function parseMetadata(text) {
  const result = {};
  for (const line of text.trim().split(/\r?\n/)) {
    const index = line.indexOf('=');
    assert(index > 0, 'Invalid build metadata');
    const key = line.slice(0, index);
    assert(!Object.hasOwn(result, key), 'Duplicate build metadata');
    result[key] = line.slice(index + 1);
  }
  return result;
}
export function validateRun(run, commit) {
  assert.equal(run.status, 'completed', 'CI must finish before publication');
  assert.equal(run.conclusion, 'success', 'CI must pass before publication');
  assert.equal(run.headSha, commit, 'CI source commit mismatch');
  for (const name of ['web', 'rust', 'Apple silicon preview']) {
    const job = run.jobs.find(job => job.name === name);
    assert(job?.conclusion === 'success', `Required CI job did not pass: ${name}`);
  }
}
export async function inspectArtifact(directory, names, version, run, mac = false) {
  assert.deepEqual((await readdir(directory)).sort(), [...names, 'SHA256SUMS.txt', 'BUILD-INFO.txt'].sort(), 'Unexpected artifact contents');
  const metadataBytes = await readFile(join(directory, 'BUILD-INFO.txt'));
  const info = parseMetadata(metadataBytes.toString());
  assert.equal(info.product, 'Companion Studio');
  assert.equal(info.version, version, 'Wrong artifact version');
  assert.equal(info.source_commit, run.headSha, 'Artifact source does not match CI');
  assert.equal(info.workflow_run, run.url, 'Artifact belongs to another CI run');
  assert.equal(info.workflow_run_attempt, String(run.attempt), 'Artifact belongs to another run attempt');
  if (mac) assert.equal(info.qualification_status, 'awaiting_hardware_verification');
  const manifest = parseChecksums(await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8'));
  assert.deepEqual([...manifest.keys()].sort(), [...names].sort(), 'Checksum manifest does not match artifact');
  const files = [];
  for (const name of names) {
    const bytes = await readFile(join(directory, name));
    assert.equal(digest(bytes), manifest.get(name), `Checksum mismatch: ${name}`);
    files.push({ name, bytes });
  }
  return { files, metadataBytes };
}
