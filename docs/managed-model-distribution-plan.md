# Managed Local Model Distribution

Implemented for Windows x64 in version 0.3.0. This supersedes the earlier proposal for company-hosted model files and a remotely signed catalog.

The app ships a pinned llama.cpp b10025 CPU runtime, prepared by scripts/prepare-runtime.ps1 from the official release archive after SHA-256 verification. The initial model is Qwen3-0.6B Q4_0, 428,970,080 bytes, Apache-2.0. src-tauri/model-catalog.json pins the upstream revision, download URL, checksum, hardware guidance, and runtime version. Updates to this catalog and runtime ship with app releases; there is no automatic remote catalog update.

Rust owns model downloads, resumable partial files, progress, cancellation, size/hash verification, atomic installation, local process lifecycle, and inference. Models live in the application local-data directory under models/. A Windows job object terminates the runtime on app exit. The runtime binds to a dynamic loopback port with a per-process authentication secret; webview code does not receive either value.

First launch offers local download, a direct API-key connection, or prototype exploration. Settings allows retrying, starting, stopping, and removing the model. The minimum is 4 GB physical RAM, with 8 GB recommended. The compact model is clearly identified as basic. No terminal or separately managed server is required.

See desktop-release.md for commands, validation evidence, and release limits. Broader model evaluations and clean-machine hardware qualification remain separate from the implemented download/runtime tests.
