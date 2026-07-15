• Proposed Plan


  # Public Beta Distribution on a Single Docker VM

  ## Summary

  Replace docs/managed-model-distribution-plan.md with a public-beta design using one Ubuntu cloud VM, Docker Compose, Caddy HTTPS,
  invite-token access, and blue-green deployments.

  The VM distributes the Companion Studio installer, signed model catalog, and GGUF file only. Inference remains on each tester’s
  Windows PC through the bundled llama-server sidecar.

  ## Hosting Architecture

  - Provision one Ubuntu 24.04 LTS VM with 2 vCPU, 4 GB RAM, and at least 40 GB encrypted SSD storage.
  - Assign a static public IP and DNS name such as beta.example.com.
  - Run:
      - Caddy for HTTPS and traffic switching.
      - Two interchangeable distribution API stacks: blue and green.
      - Shared PostgreSQL for invite-token state and audit records.
      - A scheduled backup container.

  - Bind blue and green services to loopback ports only; Caddy is the sole public entry point.
  - Store installers, catalogs, signatures, and models under versioned host directories in /srv/companion-distribution/releases.
  - Mount release files read-only into both application stacks.
  - Serve:
      - /healthz
      - /beta invitation portal
      - /v1/catalog
      - /v1/catalog.sig
      - /v1/models/<id>/<sha256>.gguf
      - /v1/releases/<version>/CompanionStudio-setup.exe

  - Support GET, HEAD, and HTTP Range requests. Reject uploads and unnecessary HTTP methods.

  ## Invite Access

  - Generate cryptographically random 256-bit invite tokens with an expiry, status, label, maximum device count, and optional download
    limit.

  - Store only an HMAC-SHA-256 token digest using a server-side pepper; never store plaintext tokens.
  - Provide an SSH-only administrative CLI:
      - invite create
      - invite list
      - invite revoke
      - invite extend
      - invite unbind-device

  - The browser beta portal accepts the invite token through a POST form and returns a short-lived Secure, HttpOnly, SameSite cookie.
    Tokens must never appear in URLs or logs.

  - Companion Studio accepts the invite code during onboarding and sends it using Authorization: Bearer.
  - Generate a random installation ID on the desktop and store it in Windows Credential Manager. Bind the invite to that installation
    on first successful native request.

  - Portal access does not consume the device allowance; the first Companion Studio installation does.
  - Revoked, expired, over-limit, or device-mismatched tokens return a generic 403 response.
  - Record token ID, installation hash, timestamp, endpoint class, status, and transferred bytes. Do not record bearer tokens,
    filenames containing user data, or conversation content.

  ## Model and Desktop Distribution

  - Initial model:
      - Qwen3-0.6B-Q4_0.gguf
      - Approximately 429 MB
      - Apache-2.0
      - SHA-256 da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4
      - Windows x64 CPU
      - Minimum 4 GB RAM; recommended 8 GB

  - Publish canonical catalog JSON with a detached Ed25519 signature. Keep the private key offline and embed only the public key in
    Companion Studio.

  - Upload models under immutable SHA-addressed paths; publish the signed catalog only after verifying the hosted file.
  - Code-sign the Windows installer and publish its SHA-256 alongside release metadata.
  - The desktop downloads into a .partial file, supports cancellation and resume, checks disk space and content length, verifies SHA-
    256, then renames atomically.

  - Store verified models under %LOCALAPPDATA%\eu.companionstudio.desktop\models.
  - Bundle the Windows x64 CPU llama-server sidecar. Run it locally on a dynamic loopback port with a random API key and proxy
    inference through Rust.

  - Allow users to skip model installation and remain in clearly labelled prototype mode.
  - Ensure prompts, responses, memories, and companion data are never sent to the beta VM.

  ## HTTPS, Firewall, and Server Hardening

  - Let Caddy obtain and renew public TLS certificates automatically; redirect HTTP to HTTPS.
  - Apply both cloud security-group and UFW rules:
      - Default deny inbound.
      - Allow TCP 80 and 443 publicly.
      - Allow TCP 22 only from an administrator VPN or fixed CIDR.
      - Deny all database and blue/green application ports externally.
      - Allow all established outbound traffic required for updates, certificates, backups, and registry pulls.

  - Bind PostgreSQL and application ports to the private Compose network only.
  - Add a DOCKER-USER firewall policy preventing containers from accidentally publishing unapproved ports.
  - Disable SSH passwords and root login; require SSH keys.
  - Enable unattended security updates, Fail2ban, automatic clock synchronization, and weekly vulnerability scans.
  - Run containers as non-root with read-only filesystems, dropped Linux capabilities, resource limits, health checks, and pinned
    image digests.

  - Store the token pepper, database password, backup credentials, and signing-public-key configuration in root-readable Docker
    secrets.

  ## Blue-Green Updates and Rollback

  - Build immutable distribution images in CI and publish them with version tags and digests.
  - Provide deployment scripts:
      - deploy-candidate <version> <color>
      - validate-candidate <color>
      - switch-traffic <color>
      - rollback
      - cleanup-old

  - Deploy the candidate to the inactive color without modifying the active stack.
  - Run database compatibility checks, container health checks, protected catalog requests, Range-download checks, signature
    validation, and a sample checksum verification.

  - Switch Caddy to the candidate and reload its configuration without stopping Caddy.
  - Monitor the candidate for at least 15 minutes before marking it active.
  - Retain the previous image, Compose project, Caddy route, and release directory for immediate rollback.
  - Database migrations must be backward-compatible for at least one release. Destructive migrations require a later cleanup
    deployment.

  - Remove older inactive stacks only after successful validation and backup.

  ## Backups, Logs, and Monitoring

  - Run nightly pg_dump backups and encrypted Restic backups to an external S3-compatible bucket.
  - Back up PostgreSQL dumps, deployment configuration, signed catalogs, signatures, invite records, and release manifests.
  - Immutable model and installer files may be restored from their governed release source, but retain their hashes and provenance in
    backups.

  - Retention: 7 daily, 4 weekly, and 6 monthly backups.
  - Take a weekly VM snapshot and perform a documented restore test every quarter.
  - Use structured JSON logs with rotation and a 30-day retention limit.
  - Redact authorization headers, cookies, invite codes, token digests, and query strings.
  - Monitor HTTPS availability, certificate expiry, disk usage, backup success, 5xx rate, authentication failures, unusual download
    volume, and container restarts.

  - Alert the beta owner when disk usage exceeds 75%, backups fail, or health checks fail repeatedly.

  - Test invite creation, expiry, revocation, device binding, unbinding, download limits, concurrent use, and token redaction.
  - Test full and Range downloads, interruption/resume, wrong content length, corrupted files, insufficient disk, and invalid
    signatures.

  - Test firewall exposure from an external machine and confirm only ports 80/443 plus restricted SSH are reachable.
  - Test TLS renewal, security headers, unsupported methods, directory traversal, and rate limiting.
  - Exercise blue-green deployment, failed candidate validation, traffic switching, immediate rollback, and backward-compatible
    database migrations.

  - Restore PostgreSQL and release metadata onto a clean replacement VM.
  - Verify through traffic capture that local inference sends no prompts or responses to the beta VM.
  - Pilot with no more than 25 invited testers before revisiting capacity.
  - A beta release passes only when installer signing, catalog signatures, artifact checksums, backups, rollback, token revocation,
    local inference, and human acceptance tests all succeed.

  ## Assumptions

  - The VM distributes files only and does not run inference.
  - The deployment is cloud-provider-neutral and uses an EU region.
  - A public DNS name and external backup bucket are available.
  - Invite tokens are the temporary beta-access mechanism; stronger SSO can replace them later.
  - GPU capacity is unnecessary unless central inference is introduced as a separately reviewed architecture.