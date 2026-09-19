import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { digest, parseChecksums, parseMetadata } from './release-assets.mjs';

export async function verifyDownloads(root) {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const document = new JSDOM(html).window.document;
  const manifest = parseChecksums(await readFile(join(root, 'downloads/SHA256SUMS.txt'), 'utf8'));
  for (const [name, expected] of manifest) {
    assert.equal(digest(await readFile(join(root, 'downloads', name))), expected, `Published checksum mismatch: ${name}`);
  }
  for (const link of document.querySelectorAll('a[download]')) {
    const href = link.getAttribute('href');
    assert(/^downloads\/[^/\\]+$/.test(href), 'Download must be a local file');
    const name = decodeURIComponent(href.slice('downloads/'.length));
    assert(!/[\\/]/.test(name), 'Unsafe download filename');
    await readFile(join(root, 'downloads', name));
    if (name !== 'SHA256SUMS.txt') assert(manifest.has(name), `Download missing checksum: ${name}`);
  }
  let release;
  try { release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (release) {
    assert(/^[a-f0-9]{40}$/.test(release.sourceCommit));
    const releaseNames = new Set(release.files.map(file => file.name));
    assert.deepEqual(new Set(manifest.keys()), releaseNames, 'Published checksum manifest contains stale or missing release files');
    for (const file of release.files) {
      assert.equal(manifest.get(file.name), file.sha256, 'Release record checksum mismatch');
      assert(file.name.includes(release.version), 'Release filename version mismatch');
      assert(document.querySelector(`a[download][href="downloads/${file.name}"]`), 'Release download missing from page');
    }
    for (const name of await readdir(join(root, 'downloads'))) {
      assert(!name.startsWith('Companion-Studio-') || releaseNames.has(name), 'Published downloads contain a stale release file');
    }
    for (const platform of ['windows', 'macos']) {
      assert.equal(document.querySelector(`#${platform}-version`)?.textContent, release.version, 'Displayed platform version mismatch');
    }
    const notice = document.querySelector('#mac-qualification')?.textContent ?? '';
    for (const phrase of ['unqualified preview', 'Metal', 'Keychain', 'pending', 'unnotarized']) assert(notice.includes(phrase), `Missing Mac disclosure: ${phrase}`);
    assert(document.querySelector('#mac-first-open'), 'Missing Mac first-open instructions');
    const info = parseMetadata(await readFile(join(root, 'downloads', release.macMetadata), 'utf8'));
    assert.equal(info.source_commit, release.sourceCommit);
    assert.equal(info.version, release.version);
    assert.equal(info.qualification_status, 'awaiting_hardware_verification');
  } else {
    const version = document.querySelector('#version')?.textContent;
    assert(version, 'Missing website version');
    for (const link of document.querySelectorAll('a[download]')) {
      if (/\.(exe|msi|dmg)$/.test(link.href)) assert(link.href.includes(version), 'Legacy download version mismatch');
    }
  }
  return 'Website download files, checksums, versions, and qualification labels passed.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await verifyDownloads(resolve(process.argv[2] ?? 'website')));
}
