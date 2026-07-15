# Threat model

## Protected assets

- Conversation content and durable memories
- Consent decisions and audit integrity
- Companion manifests and safety policies
- Local model files and provider configuration
- Encryption passphrases and future OS-backed database keys

## Principal threats and controls

| Threat | Existing control | Required follow-up |
|---|---|---|
| Silent cloud disclosure | Permission state, governed routing, sensitive-data local rule | Native cloud proxy, DLP evaluation, network allowlist |
| Model writes memory without consent | Repository and Rust command reject unconsented writes | Adversarial tool-call tests |
| Unsafe imported companion | Authenticated encryption plus schema/risk validation | Signed publisher manifests and revocation |
| Manipulative companion behavior | Declared prohibited capabilities, visible AI identity, input rules | Output classifier and dependency benchmark |
| Local database theft | Local-only storage | Field/database encryption with OS-keystore root key |
| Audit log leaks content | Metadata-only event contracts and tests | Central schema allowlist |
| Loopback service impersonation | Fixed loopback endpoint | Spawn owned sidecar, random authenticated socket/token |
| Malicious model file | None yet | Hash/signature verification and model allowlist |
| UI claims conflict with runtime | Status object and health detection | Native end-to-end assertions |
| Supply-chain compromise | Lockfiles and CI | SBOM, dependency review, signed provenance |

## Trust decisions

Model output is untrusted. A model cannot authorize data movement or durable storage. Browser fallback persistence is for development; the production desktop trust boundary is Tauri/Rust. A cloud provider must not be enabled until its EU region, retention behavior, subprocessors, DPA, and security controls are recorded.
