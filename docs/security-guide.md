# Veritas Security Architecture & Compliance Guide

Veritas is engineered around **defense-in-depth**, **privacy-first defaults**, and strict alignment with **OWASP Top 10 (2021)**, **OWASP API Security Top 10 (2023)**, and **OWASP ASVS Level 2**.

---

## 1. Threat Model & Implemented Controls

| Threat Vector | Control Implemented in `src/server/security.ts` & `src/server/app.ts` |
| :--- | :--- |
| **SSRF (Server-Side Request Forgery)** | `assertSafeExternalUrl()` blocks `file:`, `ftp:`, `data:`, `javascript:`, loopback (`127.0.0.0/8`, `::1`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), link-local / AWS/GCP cloud metadata (`169.254.169.254`, `fd00::/8`), and numeric IP obfuscation before URL crawling or source lookup. |
| **Prototype Pollution** | `stripPrototypePollutionKeys()` recursively removes `__proto__`, `constructor`, and `prototype` keys from incoming JSON payloads before persistence or processing. |
| **ReDoS (Regular Expression DoS)** | `validateSafeRegexPattern()` rejects nested quantifiers (`(a+)+`, `(.*)*`), excessive length (`> 160` chars), and invalid flags when registering custom detection plugins via `POST /api/v1/plugins`. |
| **XSS & HTML Injection** | All UI rendering relies on React's automatic DOM escaping, `/api/docs` escapes every interpolated metadata value, and `helmet`-equivalent HTTP headers set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Permissions-Policy`. `x-powered-by` is disabled. |
| **CSV Formula Injection** | `sanitizeCsvCell()` prefixes leading `=`, `+`, `-`, `@`, `\t`, and `\r` characters with a leading apostrophe (`'`) before generating bulk CSV exports. |
| **Path Traversal & Unsafe Filenames** | `sanitizeFileName()` strips directory separators (`../`, `/`, `\`), control bytes, and invalid characters from uploaded filenames and downloadable Content-Disposition attachments. |
| **CSRF (Cross-Site Request Forgery)** | Mutating endpoints verify matching `Origin` against host, `APP_URL`, or `VERITAS_ALLOWED_ORIGINS` unless authenticated with an explicit bearer/API key header (`x-api-key` or `Authorization: Bearer vrt_...`). |
| **Brute Force & DoS Flooding** | Global sliding-window IP rate limiter (`VERITAS_GLOBAL_RPM`, default `600`) plus per-API-key RPM limits and strict `multer` byte/file caps (`VERITAS_MAX_FILE_BYTES`, `VERITAS_MAX_BATCH_FILES`). |
| **Adversarial AI Evasion Attacks** | `inspectAdversarialAndNormalize()` detects invisible zero-width joiners (`U+200B..U+200D`, `U+FEFF`), Cyrillic/Greek homoglyph substitutions, Unicode Bidirectional (`Bidi`) spoofing, prompt-injection directives, and AI-Spin token perturbations, normalizing text before scoring. |

---

## 2. Cryptographic Integrity & Provenance

- **API Keys**: Generated using `crypto.randomBytes`, prefixed with `vrt_live_`, and stored strictly as **SHA-256** digests. The plaintext token is returned once upon creation and never logged.
- **Ed25519 Veritas Proofs**: Human-authorship proof bundles sign the SHA-256 content digest, drafting telemetry summary (keystroke count, paste events, edit bursts, elapsed seconds — **never raw keystroke logs**), and Merkle root using an Ed25519 keypair (`crypto.generateKeyPairSync('ed25519')`).
- **Response Cache Keys**: Cached AI router responses are indexed by a deterministic SHA-256 hash of `{ task, sanitizedPrompt, model }` to avoid cross-tenant leakage.

---

## 3. PII Airlock & Privacy Modes

Before any prompt leaves your server for an optional cloud AI provider:

1. **Mode Gate (`privacyConfig.mode`)**:
   - `'local-only'` (default): Outbound cloud inference is blocked at the router layer. Only local statistical heuristics, Whisper/Tesseract/FFmpeg, and local Ollama / vLLM / LM Studio endpoints execute.
   - `'hybrid-verified'`: Permits configured cloud providers after passing the PII Airlock.
2. **PII Redaction (`redactPiiForExternalAirlock`)**:
   - Masks email addresses (`[REDACTED_EMAIL]`), phone numbers (`[REDACTED_PHONE]`), SSN / national IDs (`[REDACTED_GOV_ID]`), payment card digits (`[REDACTED_CARD]`), and IPv4 addresses (`[REDACTED_IP]`) prior to transmission.
3. **Zero-Retention Toggle (`storeRawText: false`)**:
   - Stores cryptographic hashes, scores, and redacted excerpts while discarding raw submitted prose from persistent disk storage.
4. **Right to Erasure (`POST /api/v1/privacy/erasure`)**:
   - Purges saved records, citations, stylometric profiles, and/or proofs cleanly in one atomic action and logs the purge in `/api/v1/audit-logs`.

---

## 4. Container & Kubernetes Hardening

Both `Dockerfile` / `Dockerfile.prod` and `k8s/deployment.yaml` enforce:
- Non-root execution (`USER node` / UID `1000`, `fsGroup: 1000`, `runAsNonRoot: true`).
- `allowPrivilegeEscalation: false` and `capabilities.drop: ["ALL"]` in Kubernetes.
- `security_opt: ["no-new-privileges:true"]` in Docker Compose.
- Separate read/write PVC mount exclusively at `/app/data`.
- Secrets supplied via runtime env or `k8s/secret.yaml` — never baked into image layers.

---

## 5. Security Verification Commands

```bash
# Run unit + API + security regression + >95% coverage suite
npm run test:coverage

# Run automated release gate (audit + lint + build + coverage)
npm run validate:release

# Inspect live security headers
curl -I http://127.0.0.1:3000/api/health
```

For vulnerability disclosure procedures, see [`SECURITY.md`](../SECURITY.md).
