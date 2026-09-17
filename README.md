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

The API option supports separate OpenAI, Anthropic Claude, DeepSeek, and custom OpenAI-compatible connections. Each profile stores its key in the operating system's secure credential store, and Rust sends requests directly to that provider. The connection test sends a short test prompt and may cost money. Your provider bills all API usage.

Built-in and new companions request API permission once per chat. Existing imported companions retain their stricter policy. Permission ends on chat end, app restart, connection change, or revocation. Potentially sensitive outbound context is blocked; this heuristic can miss information. Use local mode for private conversations. No cloud fallback occurs automatically.

Windows also needs WebView2; setup may download it if missing. The locally built preview installers are unsigned.

## Use on an Apple silicon MacBook

The Mac preview targets M-series MacBooks running macOS 13 or newer. Designated testers can open a successful 0.4.0 Mac run in this repository's **Actions → verify** and download **Companion-Studio-0.4.0-macos-arm64-preview**. Extract the ZIP, verify `SHA256SUMS.txt`, inspect `BUILD-INFO.txt`, open the DMG, and drag **Companion Studio** into **Applications**. Artifacts are retained for 14 days. Every CI artifact is an unqualified candidate; sharing beyond designated testers requires all workflow jobs and real-Mac checks to pass in a separate [qualification record](docs/macos-qualification-template.md) tied to that exact DMG checksum and workflow attempt. Preserve the original build metadata unchanged. Live provider qualification is tracked separately.

This personal preview is ad-hoc signed, without Apple notarization. If macOS blocks the first launch, open **System Settings → Privacy & Security → Open Anyway** for Companion Studio after attempting to open it. Do not disable Gatekeeper globally. See [Apple's instructions](https://support.apple.com/en-us/102445).

Choose **Download a local model** for the same 429 MB model, or connect a provider profile. Provider chats include consent, reply-length and thinking controls, retry/continue/stop, saved conversations, and encrypted summaries. After the model download, local chat works offline. The Mac runtime enables Metal acceleration; API credentials and the database encryption key use macOS Keychain. Preview qualification and local build instructions are in [the Mac preview guide](docs/macos-preview.md).

## Development commands

The working source includes multi-provider chat with separate OpenAI, Anthropic Claude, DeepSeek and Custom connections, reply/thinking presets, explicit retry/continue/stop, encrypted summaries, saved conversations and local usage estimates. See the [provider chat PRD](docs/provider-chat-prd.md) and [implementation/qualification notes](docs/provider-chat.md). Existing published installers do not yet include these changes. Live provider qualification and a newly versioned Windows installer remain release gates.

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

The static website is prepared under `website-dist/` from its committed public downloads, checksums, and screenshots. It is independent of the installers built on the current machine. Open `http://127.0.0.1:1421` for local review. Nothing is uploaded. Update public assets only as a separate release action.

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

<img width="1149" height="674" alt="image" src="https://github.com/user-attachments/assets/aef2d0e8-9bbc-4152-adb2-ca5c8ac225ec" />

