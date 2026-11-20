# Veritas Pre-Release & Production Security Checklist

Every box below must pass (`[x]`) before committing code, merging a Pull Request, or tagging a public GitHub release.

---

## 1. Secret & Credential Hygiene Gate (Zero-Tolerance)

- [x] **No hardcoded API keys, PATs, OAuth secrets, JWT secrets, or cloud provider keys** in `src/`, `tests/`, `docs/`, `examples/`, `k8s/`, or `.github/`.
- [x] **No hardcoded default credentials**: Verified `src/server/store.ts` generates ephemeral CSPRNG dev tokens rather than static literals.
- [x] **No private keys or certificates** (`*.pem`, `*.key`, `*.p12`, `*.pfx`) committed; runtime Ed25519 store (`data/veritas-store.json`) is excluded from Git and Docker build context.
- [x] **`.env.example` contains strictly non-secret placeholders** (`your_*_here`, `http://localhost:3000`).
- [x] **`.gitignore` and `.dockerignore` block** `.env`, `.env.*` (`!.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`, `secrets.json`, `config.local.*`, `private/`, `tmp/`, `backups/`, `data/*.json`, and `k8s/secret.yaml`.
- [x] **Documentation & examples use safe domains** (`example.com`, `localhost`, `555-01xx`)—zero internal corporate IPs, VPNs, or live production credentials.

## 2. Automated GitHub & Pre-Commit Security Gates

- [x] **GitLeaks**: Configured via `.gitleaks.toml` and `.github/workflows/secret-and-sast-scan.yml`.
- [x] **TruffleHog**: Configured in `.github/workflows/secret-and-sast-scan.yml`.
- [x] **Semgrep SAST (`p/owasp-top-ten`, `p/secrets`, `p/typescript`)**: Configured in `.github/workflows/secret-and-sast-scan.yml`.
- [x] **CodeQL (`javascript-typescript`)**: Configured in `.github/workflows/codeql.yml`.
- [x] **Dependabot & PR Dependency Review**: Configured in `.github/dependabot.yml` and `.github/workflows/dependency-review.yml`.
- [x] **Pre-Commit Hook Protection**: Configured via `.pre-commit-config.yaml` and `.githooks/pre-commit` (`npm run hooks:install`).
- [x] **Least-Privilege GitHub Actions Permissions**: All workflows scope `permissions:` explicitly.

## 3. Application & Infrastructure Security Verification

- [ ] Run `npm run test:security` (SSRF, XSS, CSV injection, prototype pollution, ReDoS, auth bypass).
- [ ] Run `npm audit --audit-level=high` (0 high/critical CVEs).
- [ ] Run `npm run validate:release` (`tsc --noEmit`, `>=95%` V8 coverage, `vite build`).
- [ ] Before public exposure in production, set `VERITAS_REQUIRE_AUTH=true`, configure strong `POSTGRES_PASSWORD`, enable TLS termination, and confirm `data/` persistence mount permissions.
