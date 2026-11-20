# Veritas Testing & Quality Assurance Guide

Veritas enforces strict automated testing across unit, API, integration, adversarial security, AI model calibration, HTTP performance, and cross-viewport visual regression layers.

---

## 1. Quick Test Matrix

| Suite | Command | What It Verifies |
| :--- | :--- | :--- |
| Typecheck | `npm run lint` | Zero TypeScript compiler errors across client & server (`tsc --noEmit`) |
| Full Unit + API + Security + AI | `npm test` | All `tests/**/*.test.ts` suites via Vitest |
| Coverage Gate (`>=95%`) | `npm run test:coverage` | V8 coverage report + threshold enforcement (`95%` stmts/lines/funcs, `80%` branches) |
| Penetration & Red-Team | `npm run test:security` | OWASP Top 10 defenses: SSRF, XSS, CSV injection, prototype pollution, ReDoS, auth bypass |
| AI Model Calibration | `npm run test:ai` | Precision, Recall, F1, FPR, FNR, and adversarial spin detection across labeled dataset |
| HTTP Load Benchmark | `npm run test:perf` | Concurrent latency (`p50`/`p95`/`p99`) and throughput (RPS) against live port 3000 |
| Visual Regression | `npm run test:visual` | Playwright screenshots at `360px`, `768px`, and `1440px` in Light & Dark mode |
| Full Release Gate | `npm run validate:release` | Runs `lint` + `test:coverage` + production `vite build` |

---

## 2. Running Coverage Reports

```bash
npm run test:coverage
```

Vitest generates:
- Terminal per-file table
- HTML report at `coverage/lcov-report/index.html`
- Machine-readable `coverage/coverage-summary.json` and `coverage/lcov.info`

Tests isolate persistence cleanly in `/tmp/veritas-vitest-store` via `vitest.config.ts` so your local `./data/veritas-store.json` is never polluted.

---

## 3. Running Performance Benchmarks

Start Veritas in one terminal:
```bash
npm run build && NODE_ENV=production npm start
```

Run the concurrent load benchmark in another terminal:
```bash
npm run test:perf
```
Outputs JSON latency histograms (`p50Ms`, `p95Ms`, `p99Ms`, `maxMs`), RPS, failure count, and heap delta across `/api/health`, `/api/v1/security/inspect`, and `/api/v1/seo-analyze`.

---

## 4. Running Visual Regression UI Tests (Playwright)

```bash
# Install Chromium browser once (Linux/macOS/Windows)
npx playwright install --with-deps chromium

# Run visual checks
npm run test:visual

# Update baseline snapshots after intentional UI changes
npm run test:visual:update
```

Or via Docker Compose without installing Chromium locally:
```bash
docker compose --profile test run --rm visual-regression
```

---

## 5. Pre-Merge QA Checklist

1. Zero TypeScript errors (`npm run lint`).
2. `npm run test:coverage` passes 100% of specs and meets `>=95%` statements/lines/functions.
3. No React warnings (`controlled/uncontrolled`, duplicate keys, hydration mismatches) in browser console.
4. No horizontal overflow at `360px` mobile width in light or dark mode.
5. Zero `high` or `critical` vulnerabilities in `npm audit --audit-level=high`.
