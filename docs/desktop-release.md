# Desktop release 0.3.0

Windows x64 is the existing release target. An Apple silicon macOS personal preview now has a build workflow; see [Mac preview qualification](macos-preview.md). The website remains a separate Windows download site; it has no chat backend, authentication, API-key form, or analytics. Mobile, Linux, automatic updates, and cloud synchronization are outside this release. Public macOS release qualification remains pending.

## Native boundary

The frontend uses `get_engine_status`, `select_engine`, `configure_engine`, `remove_api_key`, `test_api`, `model_action`, `begin_chat`, `authorize_chat`, `end_chat`, and `complete_chat`. The native engine serializes model operations, credential changes, and inference while allowing status polling and cancellation. Engine choice is persisted; consent is memory-only and scoped to the active chat. Changing connections or engines revokes it. Existing `disabled` and `ask-every-time` manifests retain those semantics; built-in and new manifests explicitly use `ask-per-session`.

Rust builds the system instructions, rejects unsupported roles and oversized context, checks sensitive outbound content, enforces consent, and filters unsafe model output. The frontend retains its own input/output checks and metadata audit events. Detection is heuristic and does not guarantee that sensitive information will be caught. Network errors do not trigger fallback to another engine.

Provider URLs must be HTTPS without embedded credentials, query strings, or fragments. API requests use `/chat/completions` relative to the configured base, no redirects, a 15-second connect timeout, a 120-second overall timeout, non-streaming responses, and a bounded response size. Compatibility requires support for `model`, `messages`, `stream: false`, and `max_tokens`. Provider error bodies are not exposed. No browser-side provider requests or environment-supplied cloud endpoint remain in the desktop path.

## Files and credentials

- `app_local_data_dir()/engine.json`: engine selection and non-secret provider configuration; references a Credential Manager account by an opaque identifier.
- `app_local_data_dir()/models/`: verified model and resumable `.partial` file. Removing a model leaves conversations intact.
- Windows Credential Manager service `eu.companionstudio.desktop`: separate `api-<UUID>` entries for API keys. The existing `database-content-key` entry remains independent.
- Existing encrypted SQLite data stays in its original application data location. No conversation migration or cloud upload is performed.

The bundled runtime is extracted from the checksum-verified official b10025 Windows CPU ZIP. `model-catalog.json` pins the exact Hugging Face revision and LFS checksum. Neither the runtime nor the model is downloaded from a moving `latest` URL. Model installation is optional. The runtime is launched without a visible console, uses an authenticated loopback port, and is attached to a Windows kill-on-close job object. Startup verifies model content before loading it. The app does not contact an update service during ordinary local chat.

## Build and review

Run `npm run prepare:runtime`, then `npm run tauri build` in a Visual Studio developer shell with Rust available. Run `npm run build:website` after packaging; it requires screenshots and both installers, then copies the exact artifacts and computes their SHA-256 checksums. `npm run preview:website` serves the prepared site locally on port 1421. Deployment requires choosing a host; these commands do not publish anything.

Run `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml`. The opt-in `managed_local_integration` test downloads and hashes the actual model, performs a real local completion, and verifies runtime restart and cleanup. API tests use fixtures, not a paid provider account. The included onboarding screenshot is from the packaged app's WebView. The repeatable browser capture script also supports an unconfigured native-bridge fixture.

The MSI was administratively extracted into the project review directory, without installing it. `scripts/smoke-packaged.mjs` checked runtime files, launched that extracted app, and verified real native status IPC in its WebView, then closed the test process. This checks the packaged application on the development machine; it does not substitute for clean-machine installation testing.

## Release qualification limits

Local development-machine verification does not establish installation on clean 4 GB/8 GB machines. Before broad public distribution, verify clean Windows installation, upgrade from 0.2.0 with existing data, uninstall/reinstall behavior, and real API-provider compatibility using a designated test account. Obtain Windows code signing for a trusted publisher identity. This build is labelled an unsigned preview. Retain the existing production release checklist and model evaluation process; this implementation does not assert production compliance or model quality beyond the recorded tests.
