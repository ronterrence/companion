# Publishing desktop previews

Vercel serves the committed `website/` directory. Committing application source or building into ignored `src-tauri/target/` does not replace website downloads.

## Build and prepare

1. Set matching package, lockfile, Tauri, and Rust versions. Use new versions and filenames for changed binaries; never replace different installer bytes at an existing release URL.
2. Commit and push the source to the deployment branch. The first deployment continues offering the existing downloads. Wait for every job in the `verify` workflow to pass. Windows and Mac installers must come from the same source commit and workflow attempt.
3. Download both artifacts into a new local directory:

   ```powershell
   gh run download RUN_ID --repo ronterrence/companion --name Companion-Studio-0.4.0-windows-x64-preview --dir test-results/release/windows
   gh run download RUN_ID --repo ronterrence/companion --name Companion-Studio-0.4.0-macos-arm64-preview --dir test-results/release/macos
   npm run prepare:downloads -- RUN_ID test-results/release
   npm run build:website
   npm run preview:website
   ```

   Run preparation from the clean source commit used by CI. The command checks GitHub's run/job results, metadata, exact artifact contents, and original checksums. It builds and verifies a staged website before copying any public files. It does not trigger a deployment. Existing 0.3.0 files and checksum entries remain available.
4. Review the Windows EXE/MSI and Mac DMG links, platform versions, first-open instructions, metadata links, and desktop/mobile layout. Run `npm run test:release` and `npm run verify:downloads`.
5. With separate installation approval, smoke-test the Windows upgrade: version 0.4.0, preserved conversations and connections, visible provider controls. Do not send paid API requests without an approved test account and budget.
6. Commit the prepared website, release record, checksums, and versioned binaries together and push. Verify the new Vercel deployment commit. Download its three installers and compare their hashes with `website/release.json` and the published checksum manifest. Report the new deployment URL; an older deployment-specific URL can continue serving its original snapshot.

## Mac unqualified preview

Website publication is authorized after automated checks pass; real-Mac hardware testing is not a publication gate for this preview. The download must say **unqualified preview**, targets macOS 13+ on Apple silicon, ad-hoc signed and unnotarized, with real-Mac installation, Metal acceleration, upgrade behavior, installed-app Keychain access, and live-provider qualification pending.

Keep the original `BUILD-INFO.txt` contents under a versioned website filename, including `qualification_status=awaiting_hardware_verification`. Publishing does not confer hardware qualification. CI tests CPU inference and disposable Keychain entries, not real GPU behavior or installed-app Keychain access. Record later hardware checks against the exact DMG hash; do not transfer results to rebuilt bytes.

## Failure and rollback

Missing artifacts, failed CI, mismatched commits/attempts, invalid checksums, and failed staging validation stop preparation before public changes. Do not commit a partially copied release if a filesystem operation fails during promotion. Restore previous website links and release metadata to roll back; retain versioned files so previously shared links continue to work. No automatic source push promotes an installer.
