# Nine-stage acceptance matrix

Status values distinguish implemented foundations from production completion. A checked item means evidence exists in this repository; it does not imply legal certification.

| Stage | Acceptance criterion | Evidence | Status |
|---|---|---|---|
| 1. React migration | Typed React app preserves goal, review, chat, library and settings journey | `src/ui/App.tsx`, UI tests | Implemented |
| 2. Tauri shell | Minimal desktop shell and privileged Rust command boundary | `src-tauri/`, passing `cargo test` | Implemented foundation |
| 3. Persistence | Sessions/messages persist; durable memory requires consent and is companion-scoped/deletable | repository + Rust SQLite + tests; AES-GCM content encryption with OS-backed key | Implemented foundation |
| 4. Runtime indicators | Local/model/memory/cloud/safety labels come from live state | `RuntimeStatus`, `App.tsx`, UI tests | Implemented foundation |
| 5. Local inference | Detect loopback llama.cpp, call local completions, disclose fallback | `LlamaCppProvider`, UI, HTTP contract tests | Integrated; real-model evaluation pending |
| 6. Safety manifests | Reject high/prohibited risk and forbidden capabilities; show boundaries before chat | policy module + tests | Implemented foundation |
| 7. Encrypted portability | AES-256-GCM authenticated export with strong KDF, validated import and wrong-key failure | crypto module, Settings UI + tests | Implemented foundation |
| 8. Cloud routing | Current-info requests require scoped permission; sensitive requests remain local | router + tests | Decision layer implemented; provider disabled |
| 9. Compliance/release | Documentation, test gates, threat/DPIA/evaluation/release records | `docs/`, workflow | Foundation only |

## Release blockers

- Native Rust build and tests must pass on Windows, macOS, and Linux.
- Database content encryption and OS-backed key handling are implemented; an external security review remains required.
- Cloud provider, EU processing location, retention, DPA, and subprocessors must be selected and documented.
- Safety evaluations must cover emotional dependency, self-harm, minors, regulated advice, manipulation, jailbreaks, and privacy leakage.
- Accessibility testing and external security/legal review must be complete.
- The final EU AI Act classification must be recorded per intended purpose and material product change.
