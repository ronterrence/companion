# Architecture and trust boundaries

## Principles

1. Local processing is the default.
2. Durable memory requires explicit consent.
3. Sensitive data stays local unless a future, specific governed flow permits otherwise.
4. Models cannot directly write memory, change permissions, export data, or invoke cloud processing.
5. UI status is derived from runtime state and provider health.
6. Companion capabilities are declared and validated before use.
7. Audit events minimise content and identify the policy version responsible for a decision.

## Boundaries

The React UI requests operations through repository and model interfaces. In the desktop build, Tauri commands form the privileged boundary. Rust owns SQLite and denies durable-memory writes when consent is false. `llama.cpp` is loopback-only and treated as an untrusted language generator.

Cloud routing is eligible only when the task needs current information, contains no detected sensitive data, and has a live, scoped permission. Eligibility is not permission.

## Data categories

| Data | Default storage | Retention |
|---|---|---|
| Companion manifests | Local | Until deletion |
| Session messages | Local | User controlled |
| Durable memories | Local, explicit consent | Optional expiry/user deletion |
| Cloud permission | Runtime/local audit | One request by default |
| Safety/audit events | Local metadata | Defined by retention policy |
| Raw content in telemetry | Prohibited | Never |

## Known hardening work

- Store the database encryption root key in the OS credential store.
- Encrypt sensitive SQLite fields before production use.
- Pin and verify model hashes and licences.
- Sign desktop binaries and updater artifacts.
- Complete DPIA, threat model, accessibility audit, and legal classification review.
- Replace keyword safety detection with evaluated classifiers while retaining deterministic blocks.
