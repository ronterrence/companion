# Companion Studio

Desktop-first, local-first AI companions with explicit safety boundaries, consent-controlled memory, and governed optional cloud routing.

## Implemented foundation

- React and TypeScript interface
- Tauri 2 desktop shell with a Rust trust boundary
- Native SQLite sessions, messages, memories, and metadata-only audit events
- Durable memory that fails closed without explicit consent
- Versioned companion manifests and deterministic risk checks
- Managed, authenticated llama.cpp runtime with a verified first-run model download
- Truthful, visible fallback when no local model is connected
- AES-256-GCM encrypted companion export and safety-validated import
- Direct, user-key API requests with per-chat consent and sensitive-context checks
- Web, UI, policy, persistence, encryption, routing, and Rust tests
- Windows MSI and NSIS packaging
- Apple silicon macOS preview build workflow with DMG packaging

## Use as a Windows desktop app

Prepare the pinned runtime with `npm run prepare:runtime`, then build the installer with `npm run tauri build` from a Visual Studio developer shell with Rust on PATH. The Windows installer is written to `src-tauri/target/release/bundle/nsis/`; an MSI is also available in `src-tauri/target/release/bundle/msi/`.

Run the installer, then open Companion Studio from the Start menu. The packaged interface is included in the app and does not require a website, hosting, or `npm run dev`. `localhost` and `127.0.0.1` refer to your own computer.

On first launch, choose **Download a local model** or **Connect an API provider**. You may also skip setup and explore with clearly labelled prototype replies.

The local option downloads the pinned Qwen3-0.6B Q4_0 model (429 MB). The installer includes llama.cpp; the app starts and stops it automatically. Local chat works offline after setup. Minimum physical RAM is 4 GB, with 8 GB recommended. This is a basic model, not a substitute for larger models or professional advice.

The API option accepts an HTTPS base URL, a model identifier, and your provider's API key. It supports OpenAI-compatible Chat Completions APIs. Windows Credential Manager stores the key, and Rust sends requests directly to your provider. The connection test sends a short test prompt and may cost money. Your provider bills all API usage.

Built-in and new companions request API permission once per chat. Existing imported companions retain their stricter policy. Permission ends on chat end, app restart, connection change, or revocation. Potentially sensitive outbound context is blocked; this heuristic can miss information. Use local mode for private conversations. No cloud fallback occurs automatically.

Windows also needs WebView2; setup may download it if missing. The locally built preview installers are unsigned.

## Use on an Apple silicon MacBook

The Mac preview targets M-series MacBooks running macOS 13 or newer. In this repository's **Actions → verify**, open a successful run containing the Mac changes (or select **Run workflow** once they are on the default branch). Download **Companion-Studio-macos-arm64-preview** from the run's artifacts. Extract the ZIP, open the DMG, and drag **Companion Studio** into **Applications**. Artifacts are retained for 14 days; run the workflow again if expired.

This personal preview is ad-hoc signed, without Apple notarization. If macOS blocks the first launch, open **System Settings → Privacy & Security → Open Anyway** for Companion Studio after attempting to open it. Do not disable Gatekeeper globally. See [Apple's instructions](https://support.apple.com/en-us/102445).

Choose **Download a local model** for the same 429 MB model, or connect an API provider. After the model download, local chat works offline. The Mac runtime enables Metal acceleration; API credentials and the database encryption key use macOS Keychain. Preview qualification and local build instructions are in [the Mac preview guide](docs/macos-preview.md).

## Development commands

```powershell
npm install
npm run dev
npm test
npm run build
```

The web development server runs at `http://localhost:1420`.

Native development requires Rust, Microsoft Visual C++ Build Tools on Windows, and the platform-specific Tauri prerequisites:

```powershell
npm run prepare:runtime
npm run tauri dev
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug
```

## Website and release artifacts

After building the Windows installers:

```powershell
npm run build:website
npm run preview:website
```

The static website is prepared under `website-dist/` with versioned EXE/MSI downloads, SHA-256 checksums, and app screenshots. Open `http://127.0.0.1:1421` for local review. Nothing is uploaded. Deploy the entire directory when a hosting destination is chosen.

The included setup screenshot was captured from the packaged app's WebView. `scripts/capture-screenshots.mjs` can also capture the React screens against the local development server using a deterministic unconfigured native-bridge fixture. Neither capture path calls a provider or downloads a model.

## Managed model verification

```powershell
cargo test --manifest-path src-tauri/Cargo.toml managed_local_integration -- --ignored --nocapture
```

This opt-in test downloads 429 MB into `src-tauri/target/managed-integration/`, verifies its checksum, starts the real runtime, generates a reply, stops it, and restarts from the installed file. Ordinary tests use local fixtures. No real API key is needed for the test suite.

See [desktop implementation and validation](docs/desktop-release.md) for storage locations, interfaces, and remaining release checks.

## Trust model

Models generate language only. Trusted application code controls persistence, consent, routing, safety decisions, import/export, and audit events.

- [Architecture](docs/architecture.md)
- [Nine-stage acceptance matrix](docs/acceptance-matrix.md)
- [Threat model](docs/threat-model.md)
- [AI system register](docs/ai-system-register.md)
- [Evaluation plan](docs/evaluation-plan.md)

This is an engineering foundation, not a declaration of EU AI Act or GDPR compliance. Production release still requires the documented technical hardening, model evaluations, DPIA where applicable, and qualified legal review.
