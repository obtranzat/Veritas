# Public GitHub Release Checklist (v3.0.0)

Use this audit checklist before tagging or publishing any Veritas release.

---

## Engineering & Quality Gates

- [x] **Project builds cleanly**: `npm run build` succeeds (`dist/` output verified)
- [x] **TypeScript strict check passes**: `npm run lint` (`tsc --noEmit`) exits `0`
- [x] **Automated tests pass**: `7/7` Vitest test files (`37+` tests covering unit, API, integration, security pen-test, AI calibration)
- [x] **Coverage target met**: V8 coverage `>=95%` statements, lines, and functions, `>=80%` branches
- [x] **No secrets committed**: Verified `.gitignore` excludes `.env*` (`!.env.example`); no keys in source, tests, Docker, or Kubernetes manifests
- [x] **License compliance**: MIT `LICENSE` verified across `package.json`, `/api/health`, `/api/openapi.json`, and `docs/licensing.md`

## Documentation & Onboarding Completeness

- [x] **Root README (`README.md`)**: Quick start, features, screenshots, architecture, Docker/K8s, env vars, testing, troubleshooting, FAQ
- [x] **Screenshots included (`docs/screenshots/`)**: Embedded visually in `README.md`
- [x] **Full `docs/` Knowledge Base**: Getting Started, Installation (Windows/Linux/macOS), Configuration, User Manual, Admin Manual, Developer Guide, API Reference, Security, Deployment (Docker/K8s/AWS/GCP/Azure/DO/VPS), Migration, Observability, Troubleshooting, Licensing, Community & Wiki
- [x] **Architecture & Operations**: `ARCHITECTURE.md`, `TESTING.md`, `BACKUP_AND_RECOVERY.md`, `CHANGELOG.md`, `ROADMAP.md`
- [x] **Governance**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`

## Infrastructure, Examples & CI/CD

- [x] **Docker configurations**: `Dockerfile`, `Dockerfile.prod`, `Dockerfile.dev`, `docker-compose.yml`, `docker-compose.dev.yml`, `.dockerignore`
- [x] **Kubernetes manifests (`k8s/`)**: Namespace, ConfigMap, Secret template, PVC, Deployment, Service, Ingress, HPA, Kustomization
- [x] **Working examples (`examples/`)**: `api-curl.sh`, `sdk-typescript.ts`, `sdk-python.py`, `mcp-client-config.json`, `nginx-reverse-proxy.conf`
- [x] **GitHub automation (`.github/`)**: Issue forms, PR template, Dependabot, `ci-security-gate.yml`, `visual-regression.yml`, `release.yml`
- [x] **OpenAPI & Interactive Explorer**: `/api/openapi.json` and `/api/docs` match every Express route

## Tagging & Publishing Steps

```bash
# 1. Run full local verification gate
npm run validate:release

# 2. Verify clean git status and no untracked secrets
git status

# 3. Create annotated Semantic Version tag & push to trigger .github/workflows/release.yml
git tag -a v3.0.0 -m "Release v3.0.0: Veritas Content Intelligence Ecosystem"
git push origin main --tags
```
