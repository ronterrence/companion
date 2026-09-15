# Apple silicon Mac preview

The preview targets ARM64 MacBooks with macOS 13 or newer. It preserves the existing UI, native command interfaces, model, data format, and consent rules. Intel and public distribution are outside this preview.

## Build and download

The `Apple silicon preview` job in `.github/workflows/verify.yml` runs on a `macos-14` ARM64 runner on pushes, pull requests, and manual dispatch. Once these changes are pushed, open **Actions → verify**, select the run, and download **Companion-Studio-macos-arm64-preview** after the Mac job succeeds. The artifact contains a DMG and `SHA256SUMS.txt`, retained for 14 days. No website or GitHub Release is published.

Extract the artifact ZIP. In its extracted directory, optionally run `shasum -a 256 -c SHA256SUMS.txt`. Open the DMG, drag Companion Studio into Applications, eject the image, and launch the app from Applications. This preview uses ad-hoc signing without notarization; macOS may require **System Settings → Privacy & Security → Open Anyway** after the first launch attempt. See [Apple's first-open instructions](https://support.apple.com/en-us/102445) and [Tauri signing documentation](https://v2.tauri.app/distribute/sign/macos/).

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

`app_data_dir()` and `app_local_data_dir()` resolve to `~/Library/Application Support/eu.companionstudio.desktop` on macOS. This contains `companion-studio.sqlite3`, `engine.json`, and `models/`. The app discovers its packaged runtime through Tauri's resource directory at `Contents/Resources/runtime`. Keys use native Keychain under service `eu.companionstudio.desktop`, with separate database and provider entries. No storage migration is introduced. Normal application exit explicitly stops and reaps the runtime; the force-kill case is not yet qualified on macOS.

## Automated checks and remaining qualification

The workflow runs frontend tests, the frontend production build through Tauri, Rust tests, and a disposable Keychain write/read/delete test across separate processes. It checks ARM64 architecture, minimum OS metadata, executable permissions, system-only dynamic dependencies, runtime startup, and signatures in the packaged app.

It then downloads the pinned model and exercises a real reply, shutdown, and restart using the runtime inside the app bundle:

```sh
export COMPANION_TEST_RUNTIME="$PWD/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Companion Studio.app/Contents/Resources/runtime"
cargo test --locked --manifest-path src-tauri/Cargo.toml managed_local_integration -- --ignored --nocapture
```

CI sets `COMPANION_TEST_CPU=1` because hosted VMs may not expose Metal. This override exists only in test builds. Leave it unset when running this test on a real MacBook to exercise Metal.

The first Mac build of commit `0bff74a` passed on September 14, 2026: 62 frontend tests, 15 native tests, all three Keychain phases, packaged-runtime inference/restart, and bundle verification. Download the [verified preview artifact](https://github.com/ronterrence/companion/actions/runs/34857052754/artifacts/10353404504). Its DMG SHA-256 is `6e38c48b24ed55337257bd3e9db7e601f4284b63b799cf290e7d3d5b3bbfdf0a`. The separate Windows job required a follow-up runner compatibility fix.

A macOS 13 deployment target is checked automatically but is not proof of testing on macOS 13. Metal and interactive installation still require a real MacBook. Record MacBook model, OS version, artifact commit, and results for these manual checks before declaring the preview hardware-tested:

- Install from the downloaded DMG on a MacBook without development tools; verify first-open behavior and UI rendering.
- Download the model, generate a reply with Metal, restart, and chat with networking disabled.
- Save and reopen chats and memory; confirm the encryption key persists through app restarts.
- Connect a designated API test account, confirm per-chat consent and Keychain persistence, then remove the key. Actual provider testing may incur provider charges.
- Quit with Command-Q while local chat is active and confirm no `llama-server` process remains. Reopen the app and start local chat again.
- Repeat on macOS 13 and a newer macOS release; verify window sizing on a 13-inch MacBook.

Public release would require a separate Developer ID signing/notarization process and release qualification.
