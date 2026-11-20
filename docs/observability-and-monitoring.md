# Veritas Observability, Monitoring & Performance Guide

Veritas includes built-in liveness/readiness telemetry, real-time 11-tier AI failover monitoring, immutable audit logs, and automated performance regression benchmarks.

---

## 1. Health & Readiness Endpoints

| Endpoint | Interval Recommendation | Expected HTTP Status | Purpose |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | Every `10s–15s` | `200 OK` | Verifies HTTP process health, uptime metadata, version (`3.0.0`), and MIT license metadata. Used by Docker `HEALTHCHECK` and Kubernetes `livenessProbe` / `readinessProbe`. |
| `GET /api/v1/ai-routing/status` | Every `30s–60s` | `200 OK` | Reports health (`healthy`, `degraded`, `cooldown`, `offline`) for all 11 AI providers, remaining budget credits, failover count, offline queue depth, and response cache hit metrics. |
| `GET /api/v1/analytics` | On dashboard refresh | `200 OK` | Returns total scans, average AI probability, authenticity, quality, SEO scores, and verdict distribution. |
| `GET /api/v1/audit-logs` | Continuous / SIEM poll | `200 OK` | Returns timestamped governance, key issuance, erasure, and policy mutation audit events. |

---

## 2. Monitoring 11-Tier Failover & Credit Exhaustion

When any AI provider returns HTTP `402 Payment Required`, `429 RATE_LIMIT_EXCEEDED`, `RESOURCE_EXHAUSTED`, `QUOTA_EXCEEDED`, `BILLING_DISABLED`, or `INSUFFICIENT_CREDITS`:

1. **Instant Failover**: `src/server/aiRouter.ts` marks the failing provider with cooldown/exhausted state, records a structured `FailoverEvent`, and immediately routes to the next healthy tier (or local heuristic engine if offline).
2. **Administrator Alerts**: Inspect unresolved warnings in the UI (**System -> AI Failover Router**) or poll `GET /api/v1/ai-routing/status` and inspect `alerts` where `acknowledged === false`.
3. **Budget Guardrails**: Configure `creditWarnThresholdUsd` and `creditCutoffThresholdUsd` via `PATCH /api/v1/ai-routing/providers/:id` to preemptively shift traffic *before* credits reach zero.

---

## 3. Kubernetes Probes & Autoscaling (`k8s/`)

- **Readiness / Liveness** (`k8s/deployment.yaml`): Targets `GET /api/health` on port `3000`.
- **Horizontal Pod Autoscaler** (`k8s/hpa.yaml`): Scales replicas between `2` and `8` at `70%` CPU or `80%` memory utilization.

---

## 4. Load & Latency Benchmarking

Run the bundled load & performance regression suite locally or in CI:

```bash
npm run test:perf
```

This benchmark exercises burst concurrency against `/api/v1/detect` and `/api/v1/security/inspect`, verifying sub-second median response times for statistical analysis and ensuring sliding-window rate limiters enforce quotas without memory leaks.
