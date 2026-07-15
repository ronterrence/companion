# AI and privacy incident response

## Intake and containment

1. Record discovery time, reporter, affected version/model/policy and suspected scope.
2. Preserve minimal forensic evidence without copying unnecessary conversation content.
3. Disable the affected provider, companion, model, import key or release channel as appropriate.
4. Revoke exposed credentials and stop further cloud transmission or memory access.

## Classification

Assess personal-data breach, security incident, serious AI incident, unsafe model behavior, prohibited/high-risk use, consumer harm and child/vulnerable-person impact. Legal and DPO owners determine notification duties and deadlines; engineering does not make that determination alone.

## Investigation and recovery

- Reproduce against pinned model, policy, manifest and application versions.
- Identify affected users/data without broadening data access.
- Patch, test regressions, rotate material and verify deletion where required.
- Document decisions, residual risk, user remediation and release approval.

## Post-incident

Update the risk register, DPIA, evaluations, threat model and monitoring. Retain an appropriately redacted incident record. Never include secrets or unrestricted raw conversations in tickets or telemetry.
