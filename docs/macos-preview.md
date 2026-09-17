# Apple silicon Mac preview

The preview targets ARM64 MacBooks with macOS 13 or newer. Version 0.4.0 can be distributed on the website as an explicitly unqualified preview after automated checks pass. Intel support and a signed, notarized general release are outside this preview.

## Build and download

The `Apple silicon preview` job in `.github/workflows/verify.yml` runs on a `macos-14` ARM64 runner on pushes, pull requests, and manual dispatch. Open the successful run and download **Companion-Studio-0.4.0-macos-arm64-preview**. The artifact contains a DMG, `SHA256SUMS.txt`, and `BUILD-INFO.txt` with the source commit, workflow run and attempt, and qualification status. It is retained for 14 days. CI does not automatically publish a website or GitHub Release; the explicit release procedure copies verified artifacts into the website for publication.

Extract the artifact ZIP. In its extracted directory, run `shasum -a 256 -c SHA256SUMS.txt` and inspect `BUILD-INFO.txt` before installing. Open the DMG, drag Companion Studio into Applications, eject the image, and launch the app from Applications. This preview uses ad-hoc signing without notarization; macOS may require **System Settings → Privacy & Security → Open Anyway** after the first launch attempt. See [Apple's first-open instructions](https://support.apple.com/en-us/102445) and [Tauri signing documentation](https://v2.tauri.app/distribute/sign/macos/).

For a local build, install Xcode Command Line Tools (`xcode-select --install`), Node.js 24, Rust stable, and CMake. Run from a native ARM64 terminal, not Rosetta:

```sh
npm ci
npm run prepare:runtime
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --target aarch64-apple-darwin
npm run verify:mac
```

The DMG is under `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`. Rebuild runtime resources on the destination platform instead of copying a Windows `src-tauri/runtime/` directory. The verifier rejects mixed-platform native files.

## Runtime and storage

The published llama.cpp b10025 Mac binary declares macOS 26 as its minimum version. The preparation script instead builds the [pinned b10025 source](https://github.com/ggml-org/llama.cpp/tree/b10025), verifying SHA-256 `0c173562b6096f60fb8cc0b320d69e13ae27f4c31e34f9859d47658571e141b2` before extraction. A checksum mismatch stops preparation; inspect and remove only the cached source archive before retrying.

CMake targets macOS 13 and ARM64, disables host-specific CPU tuning, and statically links llama.cpp with embedded Metal shader source. Only Apple system libraries/frameworks remain dynamic, so users need neither Homebrew nor separate dylibs. The runtime license and vendor licenses accompany the binary. Native runtime HTTPS and its web UI are disabled: Rust handles verified model downloads and provider requests, while inference uses authenticated loopback. The production Mac app requests GPU offload; it never switches to cloud automatically.

`app_data_dir()` and `app_local_data_dir()` resolve to `~/Library/Application Support/eu.companionstudio.desktop` on macOS. This contains `companion-studio.sqlite3`, `engine.json`, and `models/`. The app discovers its packaged runtime through Tauri's resource directory at `Contents/Resources/runtime`. Keys use native Keychain under service `eu.companionstudio.desktop`, with separate database and provider entries. The 0.4.0 profile migration preserves existing stored connections and chats. Normal application exit explicitly stops and reaps the runtime; the force-kill case is not yet qualified on macOS.

## Automated checks and remaining qualification

The workflow runs frontend tests, the frontend production build through Tauri, Rust tests, and a disposable Keychain write/read/delete test across separate processes. It checks ARM64 architecture, minimum OS metadata, executable permissions, system-only dynamic dependencies, runtime startup, and signatures in the packaged app.

It then downloads the pinned model and exercises a real reply, shutdown, and restart using the runtime inside the app bundle:

```sh
export COMPANION_TEST_RUNTIME="$PWD/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Companion Studio.app/Contents/Resources/runtime"
cargo test --locked --manifest-path src-tauri/Cargo.toml managed_local_integration -- --ignored --nocapture
```

CI sets `COMPANION_TEST_CPU=1` because hosted VMs may not expose Metal. This override exists only in test builds. Leave it unset when running this test on a real MacBook to exercise Metal.

The prior 0.3.0 Mac artifact predates provider profiles and must not be reused for this preview. Every CI artifact starts with `qualification_status=awaiting_hardware_verification`. Preserve its metadata and DMG bytes when publishing through the [release procedure](publishing.md). All automated checks must pass, but pending hardware and live-provider qualification do not block publication as an **unqualified preview**. State those limitations beside the download. Later hardware test records must identify the source commit, workflow run and attempt, artifact ID, and DMG checksum. A rebuilt DMG requires a new record, even when its version is unchanged.

The uploaded artifact must contain exactly `Companion Studio_0.4.0_aarch64.dmg`, `SHA256SUMS.txt`, and `BUILD-INFO.txt`. Before upload, `npm run verify:mac -- --artifact` requires exactly one versioned ARM64 DMG and a matching single-entry checksum manifest, validates metadata, mounts the DMG read-only, and verifies the enclosed app's version, architecture, minimum OS, runtime, dependencies, and signatures. CI's disposable Keychain test uses a Rust test executable; installed-app credential access still requires manual verification.

A macOS 13 deployment target is checked automatically but is not proof of testing on macOS 13. Metal and interactive installation still require a real MacBook. Record MacBook model, OS version, artifact commit, and results for these manual checks before declaring the preview hardware-tested:

- Install from the downloaded DMG on a MacBook without development tools; verify first-open behavior and UI rendering.
- Upgrade an existing 0.3.0 install; confirm saved chats, memory, encryption keys, and its provider connection remain available.
- Download the model, generate a reply with Metal, restart, and chat with networking disabled. Record runtime evidence of Metal GPU offload; a successful reply alone does not prove GPU use.
- With an explicitly approved test account and bounded spending budget, connect a provider and confirm per-chat consent, reply controls, retry, cancellation, continuation, and saved-chat reopening. Quit and reopen the installed app, confirm the configured credential remains usable in Keychain, then remove the connection and verify its credential is deleted while other credentials and encrypted chats remain available. Never include key values in the test record.
- Quit with Command-Q while local chat is active and confirm no `llama-server` process remains. Reopen the app and start local chat again.
- Repeat on macOS 13 and a newer macOS release; verify window sizing on a 13-inch MacBook.

Record the MacBook model, macOS version, source commit, workflow run and attempt, DMG checksum, and result for every manual qualification. One provider smoke test does not qualify all adapters or model presets. Full live-provider qualification remains separate and requires an approved account and spending budget. A signed, notarized general release requires a separate Developer ID signing/notarization process and release qualification.
