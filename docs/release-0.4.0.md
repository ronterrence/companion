# Companion Studio 0.4.0 preview

Built from source commit `03e7a50a9229989e4a9fdb5ef9ee43cc614d091f` in [verify run 35242230714, attempt 1](https://github.com/ronterrence/companion/actions/runs/35242230714).

## Included

Separate OpenAI, Claude, DeepSeek, and custom provider profiles; provider-specific requests; reply and thinking controls; retry, continue, and stop; saved conversations; encrypted summaries; and usage estimates. The app now displays its actual package version.

## Verification

- All workflow jobs passed: frontend tests and build, Rust tests, Windows installer inspection, and Apple-silicon bundle checks.
- Windows EXE/MSI version 0.4.0 and the packaged x64 provider implementation were verified.
- On September 18, 2026, the published candidate EXE successfully upgraded an existing Windows 0.3.0 installation. Existing encrypted sessions, messages, and companions were unchanged; the app decrypted and listed the saved conversations; the existing API connection migrated to a selected profile; provider controls were visible. No API requests were sent.
- Mac CI passed ARM64 architecture, macOS deployment-target, signatures, bundled dependencies, disposable Keychain persistence, CPU inference/restart, DMG contents, and checksum checks.
- Website checks passed for download existence and hashes, displayed versions, Mac disclosures, desktop/mobile layout, and automated accessibility.

## Qualification limits

The Mac download is an **unqualified preview**, ad-hoc signed and unnotarized, targeting macOS 13+ on Apple silicon. Real-Mac installation, Metal acceleration, upgrade behavior, and installed-app Keychain access remain pending. Its original metadata retains `qualification_status=awaiting_hardware_verification`.

Live-provider qualification remains pending on both platforms. Preserved connection settings do not establish that a live model request succeeds.

## Artifact identity

The authoritative filenames and SHA-256 hashes are committed in `website/release.json` and `website/downloads/SHA256SUMS.txt`. Original Windows and Mac build metadata are published alongside the downloads under versioned filenames. The website release commit is separate from the source commit used to build these installers. Website downloads contain only the current 0.4.0 release; older artifacts remain only in local build output.
