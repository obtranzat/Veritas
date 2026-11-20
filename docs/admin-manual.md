# Administrator & Enterprise Manual

Operations guide for institutional administrators, security officers, and self-hosted node maintainers.

---

## 1. Managing Local RBAC & Active Identity

Navigate to **Platform & Governance -> Privacy & Team**:
- Assign roles: `Admin`, `Researcher`, `Reviewer`, or `Viewer`.
- Switch active local review identity in the left sidebar footer when annotating detection reports.
- Every administrative action (API key creation, privacy changes, user role edits, erasures) writes an immutable entry to **History & Audit -> Audit Logs** (`GET /api/v1/audit-logs`).

---

## 2. Sovereign Privacy Airlock & GDPR Erasure

- **Hybrid PII Airlock**: Automatically redacts emails, phone numbers, SSNs, and API secret patterns (`[REDACTED_EMAIL]`, etc.) before optional cloud provider requests.
- **Strict Local-Only Mode**: Blocks 100% of external AI/web calls (`local-only`). All detection, stylometry, code AST, and Ed25519 signing remain active offline.
- **Raw Text Retention**: Toggle `storeRawText` off if policy permits only storing scores and metadata.
- **Right-to-Erasure**: Execute `POST /api/v1/privacy/erasure` to scrub stored detection history, proofs, citations, or specific records cleanly.

---

## 3. API Keys, Rate Limits & Custom Plugins

Navigate to **Platform & Governance -> API, MCP & LTI**:
- **Issue Bearer Keys**: Keys use the `vrt_live_...` format. Copy the key once on issuance; Veritas stores only its SHA-256 hash. Configure per-key **RPM** limits (e.g., `240` or `5000` RPM).
- **Custom Detection Plugins**: Add organization-specific phrase lists or RegExp rules (protected by `validateSafeRegexPattern` against ReDoS attacks) with positive (`+`) or negative (`-`) weighting.
- **MCP & LTI 1.3**: Copy `/api/v1/lti/config.json` to register Veritas inside **Canvas, Moodle, Blackboard, or D2L**.

---

## 4. 11-Tier AI Failover & Credit Guardrails

Navigate to **Platform & Governance -> AI Failover & Local**:
- **Routing Strategy**: Choose `local-first` (recommended), `cheapest`, `fastest`, or `highest-quality`.
- **Pre-Zero Credit Switch Floor**: Set e.g. `$0.25` USD so Veritas automatically shifts traffic away before a cloud account hits `$0.00`.
- **Health Probes & Offline Queue**: Click **Probe Local Servers & Budgets** to verify Ollama/vLLM/LM Studio availability; click **Replay Queued Jobs** once connectivity/credits recover to execute queued web/fact-check jobs automatically.
- **Admin Alerts**: Unacknowledged failover or credit exhaustion alerts surface in the top header bar across every screen.
