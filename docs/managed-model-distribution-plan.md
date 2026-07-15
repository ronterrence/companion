# Managed Local Model Distribution

  ## Summary

  Save this specification in docs/managed-model-distribution-plan.md, then implement a Windows x64 Companion Studio installer
  containing a managed CPU llama-server sidecar. On first launch, users may download the approved Qwen3 model or skip and retain
  prototype mode.

  ## Key Changes

  - Bundle pinned Windows x64 CPU llama-server binaries through Tauri externalBin; Rust exclusively controls the process.
  - Store models under %LOCALAPPDATA%\eu.companionstudio.desktop\models.
  - Download Qwen3-0.6B-Q4_0.gguf from company-controlled HTTPS storage using resumable .partial files, progress reporting,
    cancellation, disk-space checks, SHA-256 verification, and atomic installation.

  - Require SHA-256 da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4 for the initial mirrored artifact.
  - Fetch an Ed25519-signed catalog containing model version, URL, size, hash, license, RAM requirements, intended use, limitations,
    and runtime compatibility.

  - Start the verified model on a dynamic loopback port with a random API key. Proxy inference through Rust so the webview never
    receives the endpoint or secret.

  - Stop the process on application exit and use Windows kill-on-close process management to prevent orphan servers.
  - Add first-run model setup with information, hardware/storage checks, progress, retry, failure, success, and “Skip for now.”
  - Add Settings controls for status, download progress, license, version, updates, start/stop, retry, and removal.
  - Use explicit states: not-installed, downloading, verifying, installed, starting, ready, stopping, and failed.
  - Check the signed catalog at most every 24 hours. Install updates alongside the working version, verify and health-check them, then
    switch atomically with rollback available.

  - Preserve the existing safety, consent, persistence, and output-validation boundaries around native inference.

  ## Native Interfaces

  - get_model_catalog()
  - get_model_status()
  - download_model(model_id, progress_channel)
  - cancel_model_download()
  - start_model()
  - complete_local(request)

  ## Test Plan

  - Test catalog signatures, expiry, HTTPS restrictions, hashes, unsafe paths, architecture, and runtime compatibility.
  - Test successful, resumed, cancelled, truncated, corrupted, insufficient-space, and failed downloads.
  - Test sidecar arguments, API authentication, dynamic ports, health timeouts, crash recovery, and shutdown cleanup.
  - Test onboarding, skipping, retrying, Settings controls, updates, rollback, and truthful runtime labels.
  - Run existing safety tests through the native inference path.
  - Verify release installation on clean 4 GB and 8 GB Windows x64 machines, including offline use, interrupted downloads, upgrade,
    uninstall, and reinstall.

  - Require human acceptance by at least two nontechnical colleagues.

  ## Assumptions

  - Initial platform: Windows x64.
  - Initial runtime: CPU backend.
  - Initial model: Qwen3-0.6B Q4_0, approximately 429 MB, Apache-2.0.
  - Minimum RAM: 4 GB; recommended RAM: 8 GB.
  - Model installation is optional.
  - The company supplies the HTTPS base URL and protects the offline Ed25519 private key.
  - App and sidecar updates remain coupled; model updates use the signed catalog.
