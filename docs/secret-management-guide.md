# Veritas Secret Management & Credential Hygiene Guide

Strict operational handbook ensuring **zero secrets, tokens, passwords, certificates, or private endpoints** are ever committed to source control, containers, or CI artifacts.

---

## 1. Golden Rules for Contributors & Operators

1. **Never commit `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`, `secrets.json`, `data/*.json`, or `k8s/secret.yaml`.** All are blocked by [`.gitignore`](../.gitignore), [`.dockerignore`](../.dockerignore), and [`.githooks/pre-commit`](../.githooks/pre-commit).
2. **All examples and templates must use non-secret placeholders** (`your_api_key_here`, `your_strong_db_password_here`, `http://localhost:3000`, `@example.com`).
3. **API Keys at rest**: Veritas hashes issued `vrt_live_...` API tokens with **SHA-256** and verifies them via `crypto.timingSafeEqual`. Plaintext keys are shown only once on creation or generated ephemerally at runtime via `crypto.randomBytes`.
4. **Ed25519 Signing Keys**: Generated lazily per node inside `VERITAS_DATA_DIR/veritas-store.json` (git-ignored and mounted strictly on a private persistent volume).

---

## 2. Installing Local Pre-Commit Protection

Enable Veritas's built-in secret scanner hook immediately after cloning:

```bash
npm run hooks:install
```

*(Optionally also install `pre-commit` with `.pre-commit-config.yaml` and `gitleaks` for deep regex/entropy checking before every commit.)*

---

## 3. Secrets Across Environments

| Environment | How Secrets Are Supplied | Never Do This |
| :--- | :--- | :--- |
| **Local Development** | Uncommitted `.env` copied from `.env.example` | Do not place real keys in `.env.example`, `README.md`, or `tests/` |
| **GitHub Actions CI/CD** | Encrypted **Repository / Environment Secrets** (`${{ secrets.* }}`) | Never echo `${{ secrets.* }}` or hardcode tokens in `.github/workflows/*.yml` |
| **Docker Compose** | Runtime `.env` injection or Docker Secrets (`POSTGRES_PASSWORD`) | Never `COPY .env` or `ENV GEMINI_API_KEY=...` inside any `Dockerfile` |
| **Kubernetes** | `kubectl create secret` / Sealed Secrets / External Secrets Operator (`k8s/secret.yaml`) | Never commit populated `k8s/secret.yaml`; only `k8s/secret.example.yaml` belongs in Git |

---

## 4. Incident Remediation: If a Secret Is Accidentally Committed

If any token, private key, or password enters commit history:

1. **Rotate & Revoke Immediately (First 5 Minutes)**:
   - Revoke leaked provider keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc.), GitHub PATs, and `POSTGRES_PASSWORD`.
   - Revoke compromised Veritas bearer tokens via `DELETE /api/v1/keys/{id}` and clear/re-mint `data/veritas-store.json` if signing keys leaked.
2. **Purge From Git History**:

   ```bash
   # Recommended: git-filter-repo (replace secret string or purge leaked file)
   git filter-repo --invert-paths --path path/to/leaked.env --force
   # Or replace leaked token literals globally across all commits:
   git filter-repo --replace-text expressions.txt --force

   # Force-push cleaned refs and run aggressive garbage collection
   git push --force --all
   git push --force --tags
   ```

3. **Document & Audit**: Run `gitleaks detect --source . --config=.gitleaks.toml --verbose` and re-run `npm run validate:release` before re-opening public access.
