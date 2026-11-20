# Security Policy

Veritas takes the security of self-hosted content intelligence nodes, academic integrity workflows, and cryptographic provenance seals seriously.

---

## Supported Versions

| Version | Supported | Notes |
| :--- | :--- | :--- |
| `3.x` (Current `main`) | Yes | Active feature updates, CVE patches, and security hardening |
| `2.x` | Security Fixes Only | Critical vulnerability patches until next minor cycle |
| `< 2.0` | No (EOL) | Upgrade to `3.x` immediately |

---

## Responsible Disclosure Policy & Safe Harbor

**Please do not report security vulnerabilities through public GitHub Issues or Discussions.**

Instead, report vulnerabilities privately through one of these channels:
1. **GitHub Private Security Advisories (Preferred)**: Open a private advisory in the repository `Security -> Advisories -> Report a vulnerability`.
2. **Direct Maintainer Email**: Send details to **gaikhomun@gmail.com** with subject `[SECURITY] Veritas Vulnerability Report`.

### What to Include
- Affected component, endpoint, or file path
- Minimal reproduction steps or proof-of-concept request (without testing against third-party live systems)
- Potential security impact (e.g., SSRF, auth bypass, XSS, RCE, secret exposure, path traversal)
- Suggested remediation (if known)

### Coordinated Disclosure Commitments & Safe Harbor
- **Acknowledgment**: Within **48 hours**
- **Triage & Severity Assessment**: Within **5 business days**
- **Fix & Coordinated Advisory**: Critical/High issues targeted within **7–14 days**; reporters are credited (with consent) in `CHANGELOG.md` and GitHub Security Advisories.
- **Safe Harbor**: We will not pursue legal action against researchers who conduct good-faith vulnerability testing on their own local Veritas instances, avoid accessing or modifying third-party data, and follow responsible disclosure timelines.
- **Automated Secret & SAST Gate**: Every PR and push runs **Gitleaks**, **TruffleHog**, **Semgrep**, **CodeQL**, and **Dependabot / Dependency Review** workflows under `.github/workflows/`.

---

## Built-In Security Controls

- **SSRF Defense (`assertSafeExternalUrl`)**: Blocks non-HTTP(S) schemes, loopback (`127.0.0.1`, `::1`), RFC1918 private subnets, link-local metadata IPs (`169.254.169.254`), and `.local`/`.internal` hostnames before outbound web fetching.
- **CSV Formula Injection Neutralization (`sanitizeCsvCell`)**: Prefixes leading `=`, `+`, `-`, `@`, `\t`, `\r` cells on export.
- **ReDoS Prevention (`validateSafeRegexPattern`)**: Rejects nested quantifiers and excessive regex lengths on custom plugin creation.
- **Prototype Pollution Guard (`stripPrototypePollutionKeys`)**: Recursively strips `__proto__`, `constructor`, and `prototype` keys on ingested JSON payloads.
- **Path Traversal Guard (`sanitizeFileName`)**: Strips directories and unsafe characters on uploaded/exported filenames.
- **Hashed Bearer Keys (`vrt_live_...`)**: Raw keys are shown once at creation and stored strictly as SHA-256 digests with `crypto.timingSafeEqual` verification and per-key RPM tracking.
- **PII Airlock (`redactPiiForExternalAirlock`)**: Scrubs emails, phones, SSNs, and API token patterns before optional external LLM egress, with strict `local-only` offline mode available.
- **Cryptographic Provenance**: Uses real Node `node:crypto` **Ed25519** signatures and SHA-256 Merkle commitments.

---

## Production Hardening Recommendations

1. **Enable API Authentication**: Set `VERITAS_REQUIRE_AUTH="true"` before exposing Veritas on any shared or public network. Issue scoped API keys and revoke unused tokens.
2. **Enable Clickjacking Protection**: Set `VERITAS_FRAME_DENY="true"` for standalone web deployments.
3. **Terminate TLS at Reverse Proxy**: Run behind Nginx/Caddy/Ingress with HTTPS (`HSTS` is automatically enabled when `NODE_ENV=production`).
4. **Restrict Container Privileges**: Run with non-root user (`USER node`), `no-new-privileges:true` (already configured in `docker-compose.yml` & `k8s/deployment.yaml`), and minimal capabilities (`drop: ["ALL"]`).
5. **Run Regular Audits**: Execute `npm run test:security` and `npm audit --audit-level=high` in CI/CD before every deployment.
