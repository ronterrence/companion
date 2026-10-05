# Mac preview qualification in progress — 2026-10-05

## Candidate

- Version: 0.4.0
- Source commit: `03e7a50a9229989e4a9fdb5ef9ee43cc614d091f`
- Workflow: [run 35242230714, attempt 1](https://github.com/ronterrence/companion/actions/runs/35242230714)
- Original build metadata: `website/downloads/Companion-Studio-0.4.0-macos-BUILD-INFO.txt`, retaining `qualification_status=awaiting_hardware_verification`
- DMG: `Companion-Studio-0.4.0_aarch64.dmg`; SHA-256 on the Mac: `987214463319a01aad348264be8ee86ae6a963749dd1a7027ff1c71bb930c779` (matches `website/release.json`)
- Artifact ID: not recorded

## Machine and observations

Scaleway Mac mini `Macmini9,1`, Apple M1, 8 GiB RAM, macOS 26.6.1. These checks used the installed app at `/Applications/Companion Studio.app`, whose bundle reports version 0.4.0. The machine has development tools, so this is not a clean-machine installation test.

| Check | Result and evidence |
| --- | --- |
| DMG and first launch | DMG checksum matched the published manifest; the app was installed and opened through TigerVNC. Earlier session screenshots are in the ignored `test-results/` directory. First-open behavior on a machine without development tools remains pending. |
| Metal runtime | The bundled runtime's direct test log identifies `MTL0 (Apple M1)` and assigns model layers to it. The installed app ran `llama-server` with GPU offload requested. An app chat returned `4` for two plus two. |
| Quit and restart | Quitting the app with AppleScript while a local chat was open left no `companion-studio` or `llama-server` process. The app reopened successfully. Command-Q itself remains untested. |
| Saved chat and resumed local reply | The saved question and answer survived restart. After explicitly selecting **Use local model**, Tiger's saved engine setting was `local`, `llama-server` was running, and the resumed chat answered five plus seven with `12`. |
| Keychain database key | A read-only `security find-generic-password` check found the `database-content-key` entry after app relaunch. Installed-app provider credentials remain untested. |

## Issue found

Opening the saved local conversation in the published 0.4.0 app selected Prototype mode and showed “Conversation restored. Select a model in Settings before continuing.” The chat history was preserved, but a reply before reselecting the local model did **not** count as local inference. The user restored Local mode through **Settings → Use local model**. The source fix in `src/ui/App.tsx` selects the installed local model when reopening a local conversation; it is not present in the published DMG. The added regression test, full frontend suite (76 tests), and frontend build pass locally. A new Mac artifact and repeat hardware check are needed to qualify that fix.

## Still pending

- macOS 13 testing, upgrade from the 0.3.0 Mac app, and a 13-inch MacBook window check.
- Local chat with networking disabled. Do not disable the remote Mac mini's network to perform this test; doing so would interrupt access.
- Command-Q during active generation and relaunch verification.
- Live-provider consent, reply controls, cancellation, continuation, saved-chat reopening, and Keychain credential lifecycle with an approved test account and spending budget.
- Artifact ID and complete qualification against any rebuilt DMG.

Decision: **partial hardware verification; retain `awaiting_hardware_verification`** for the published 0.4.0 DMG.
