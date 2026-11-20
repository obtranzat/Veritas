# Veritas API Reference (v3.0.0)

Veritas exposes a self-hosted **OpenAPI 3.1 REST API**, **Server-Sent Events (SSE)** job progress streams, a **Model Context Protocol (MCP)** JSON-RPC 2.0 endpoint, and an **LTI 1.3** LMS manifest.

- **Interactive Explorer**: `GET /api/docs`
- **Machine-Readable OpenAPI 3.1 JSON**: `GET /api/openapi.json` (and static copy in [`docs/openapi.json`](./openapi.json))
- **Example Clients**: [`examples/api-curl.sh`](../examples/api-curl.sh), [`examples/sdk-typescript.ts`](../examples/sdk-typescript.ts), [`examples/sdk-python.py`](../examples/sdk-python.py)

---

## 1. Authentication, CSRF & Rate Limiting

### Authentication Headers

When `VERITAS_REQUIRE_AUTH=false` (default local development mode), requests run unauthenticated unless an API key header is sent. When `VERITAS_REQUIRE_AUTH=true`, every `/api/v1/*` request (except `/api/v1/lti/config.json`) requires an issued key via either header:

```http
x-api-key: vrt_live_<token>
```

or

```http
Authorization: Bearer vrt_live_<token>
```

Keys are generated via `POST /api/v1/keys`, stored only as SHA-256 hashes, and enforced with RBAC roles (`Admin`, `Researcher`, `Reviewer`, `Viewer`).

### Rate Limiting

Every `/api/v1/*` response includes standard rate-limit headers:

- `RateLimit-Limit` — Global IP RPM limit (`VERITAS_GLOBAL_RPM`, default `600`) or per-key RPM limit.
- `RateLimit-Remaining` — Requests remaining in the active 60-second sliding window.
- `Retry-After` — Returned with `429 Too Many Requests`.

### Cross-Origin CSRF Protection

State-mutating browser requests (`POST`, `PUT`, `PATCH`, `DELETE`) without a valid `x-api-key` / `Bearer vrt_...` header must match the host `Origin`, `APP_URL`, or `VERITAS_ALLOWED_ORIGINS`.

---

## 2. System & Specification Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Liveness/readiness check returning status, runtime capabilities, and MIT license metadata. |
| `GET` | `/api/openapi.json` | Live OpenAPI 3.1.0 specification JSON bound to the active host. |
| `GET` | `/api/docs` | Self-hosted HTML API reference table powered by `buildOpenApiSpec`. |

---

## 3. Core Content Intelligence & Forensics

### `POST /api/v1/detect`

Runs the complete Content Intelligence pipeline: AI probability & confidence scoring, suspected model family, sentence attribution, authenticity grading (`0–100`), readability metrics, content quality, SEO & GEO analysis, academic integrity, adversarial evasion scan, and 11-tier AI failover metadata.

**Request JSON:**

```json
{
  "title": "Q4 Architecture Brief",
  "targetKeyword": "observability",
  "text": "Organizations running distributed systems require clear telemetry pipelines..."
}
```

**Response (`200 OK`):** Full `DetectionRecord` object including `id`, `verdict`, `aiProbability`, `confidence`, `authenticity`, `contentQuality`, `readability`, `academicIntegrity`, `seoAnalysis`, `geoAnalysis`, `adversarialSecurity`, and `routingMeta`.

---

### `POST /api/v1/analyze-media`

Analyzes uploaded documents (`PDF`, `DOCX`, `TXT`, `RTF`, `ODT`), images (`PNG`, `JPG`, `JPEG`, `WEBP`, `TIFF`), audio, or video files (`multipart/form-data` with field `file`).

```bash
curl -X POST http://127.0.0.1:3000/api/v1/analyze-media \
  -F "file=@./paper.pdf" \
  -F "title=Submitted Draft"
```

---

### `POST /api/v1/detect/batch`

Queues multiple uploaded files (`multipart/form-data` array field `files`, bounded only by `VERITAS_MAX_BATCH_FILES` and `VERITAS_MAX_FILE_BYTES`) for parallel worker execution.

**Response (`202 Accepted`):** Returns `QueueJob` containing `id` and `streamUrl` (`/api/v1/jobs/{id}/stream`).

---

### `POST /api/v1/analyze-url`

Crawls 1–10 same-origin web pages starting from `url` (validated against SSRF / private IP rules) and executes full detection + SEO/GEO analysis per page.

```json
{
  "url": "https://example.org/research-article",
  "maxPages": 3,
  "targetKeyword": "open source"
}
```

---

## 4. Humanization, Fact-Checking, Citations, Plagiarism & SEO

| Method | Path | Purpose | Key Input Fields |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/humanize` | Rewrite AI-flagged prose (`light`, `moderate`, `aggressive`) & automatically re-score against detector | `{ "text" \| "recordId", "intensity" }` |
| `POST` | `/api/v1/fact-check` | Extract verifiable claims and check against grounded sources | `{ "text", "recordId"? }` |
| `POST` | `/api/v1/plagiarism-web` | Cross-check distinctive phrases against indexed web sources | `{ "text", "recordId"? }` |
| `POST` | `/api/v1/plagiarism-crosslingual` | Detect translated / cross-lingual borrowing across world languages | `{ "text", "recordId"? }` |
| `POST` | `/api/v1/citations/entailment` | Test whether a cited source URL supports, contradicts, or omits a claim | `{ "claim", "sourceUrl" }` |
| `POST` | `/api/v1/seo-analyze` | Run SEO + GEO (Generative Engine Optimization) audit | `{ "text" \| "recordId", "targetKeyword"? }` |
| `POST` | `/api/v1/exclusions/recalculate` | Re-score a record excluding quotes, bibliographies, headers, and matches `< N` words | `{ "recordId", "filters": { ... } }` |
| `GET` | `/api/v1/citations` | List bibliographic entries in local vault | — |
| `POST` | `/api/v1/citations` | Save citation entry (`title`, `authors`, `year`, `style`, `doi`, `url`) | Citation payload |
| `POST` | `/api/v1/citations/lookup` | Resolve bibliographic metadata from DOI, title, or URL | `{ "query" }` |
| `DELETE` | `/api/v1/citations/{id}` | Remove citation entry from vault | Path `id` |

---

## 5. Adversarial Security & Source-Code Forensics

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/v1/security/inspect` | Scan text for zero-width steganography, Unicode homoglyphs, Bidi overrides, prompt-injection payloads, AI-Spin watermarks, and test PII Airlock redaction. |
| `GET` | `/api/v1/code-reports` | List saved source-code forensics & SPDX license reports. |
| `POST` | `/api/v1/analyze-code` | Detect AI-generated source code, compute variable-rename-invariant AST fingerprints (16-char hash), and audit SPDX OSS licenses (`{ "code", "language", "title" }`). |

---

## 6. Provenance, Author Stylometric Twins & Ed25519 Proofs

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v1/authorship/profiles` | List non-reversible Author Stylometric Twin profiles. |
| `POST` | `/api/v1/authorship/profiles` | Enroll or update an Author Stylometric Twin (`authorName`, `departmentOrRole`, `sampleText` with `>= 40` words). |
| `DELETE` | `/api/v1/authorship/profiles/{id}` | Delete an author profile. |
| `POST` | `/api/v1/authorship/verify` | Compare submitted text against an enrolled baseline vector for contract-cheating / stylistic drift. |
| `GET` | `/api/v1/proofs` | List minted Ed25519 Veritas Proof bundles. |
| `POST` | `/api/v1/proofs/create` | Mint a cryptographic Ed25519 + SHA-256 Merkle attestation bundle from drafting telemetry. |
| `POST` | `/api/v1/proofs/verify` | Verify Ed25519 signature & optional raw-text SHA-256 digest (`{ "bundle", "rawContent"? }`). |
| `GET` | `/api/v1/proofs/{id}/badge.svg` | Render self-hosted SVG verification badge. |

---

## 7. 11-Tier AI Failover Router Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v1/ai-routing/status` | Live snapshot of all 11 providers, health, latency, estimated remaining credit balances, failover events, unacknowledged alerts, offline queue size, and response cache stats. |
| `PUT` | `/api/v1/ai-routing/policy` | Configure routing strategy (`local-first`, `cheapest`, `fastest`, `highest-quality`), `offlineMode`, `preferredLocalFamily` (`llama`, `qwen`, `deepseek`, `mistral`, `gemma`), `cacheEnabled`, and credit thresholds. |
| `PATCH` | `/api/v1/ai-routing/providers/{id}` | Enable/disable a provider, set active model, adjust credit reserve thresholds, or reset circuit-breaker cooldown (`resetCooldown: true`). |
| `POST` | `/api/v1/ai-routing/probe` | Actively probe local Ollama / vLLM / LM Studio endpoints and refresh cloud credit status. |
| `POST` | `/api/v1/ai-routing/alerts/ack` | Acknowledge a specific `alertId` or `{ "ackAll": true }`. |
| `POST` | `/api/v1/ai-routing/queue/process` | Replay deferred cloud enrichment jobs queued during offline or quota-exhausted intervals. |
| `DELETE` | `/api/v1/ai-routing/cache` | Flush the SHA-256 inference response cache. |

---

## 8. Batch Jobs, History, Exports & Governance

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v1/jobs` | List all queued, running, and finished batch jobs. |
| `GET` | `/api/v1/jobs/{id}` | Fetch current state of a single batch job. |
| `GET` | `/api/v1/jobs/{id}/stream` | Server-Sent Events (`text/event-stream`) real-time progress feed for batch job `id`. |
| `GET` | `/api/v1/history` | List stored detection records. |
| `DELETE` | `/api/v1/history/{id}` | Delete a detection record. |
| `POST` | `/api/v1/history/{id}/comments` | Add team review notes (`author`, `body`). |
| `GET` | `/api/v1/analytics` | Aggregate score distributions and platform metrics. |
| `POST` | `/api/v1/export/docx` | Download a formatted Microsoft Word (`.docx`) report (`{ "recordId" }`). |
| `POST` | `/api/v1/export/bulk` | Download a `.zip` archive of selected records in JSON, TXT, CSV, and DOCX (`{ "recordIds": [...] }`). |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/v1/keys`, `/api/v1/keys/{id}` | Manage API keys and per-key RPM quotas. |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/v1/plugins`, `/api/v1/plugins/{id}` | Manage ReDoS-safe custom keyword/regex detection rules. |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/v1/users`, `/api/v1/users/{id}` | Manage RBAC team users (`Admin`, `Researcher`, `Reviewer`, `Viewer`). |
| `GET` | `/api/v1/audit-logs` | Read immutable security & governance audit log. |
| `GET` / `PUT` | `/api/v1/privacy-config` | Read or update Privacy Airlock mode (`local-only` / `hybrid-verified`) and PII scrubbing toggle. |
| `POST` | `/api/v1/privacy/erasure` | Execute GDPR-style data erasure (`scope`: `'records' \| 'all'`). |

---

## 9. Ecosystem Protocols (MCP & LTI 1.3)

### `POST /api/v1/mcp`

JSON-RPC 2.0 endpoint for IDE copilots and agentic toolchains. Supports `initialize`, `tools/list`, and `tools/call` (`veritas_detect_text`, `veritas_inspect_security`, `veritas_analyze_code`, `veritas_routing_status`). See [`examples/mcp-client-config.json`](../examples/mcp-client-config.json).

### `GET /api/v1/lti/config.json`

Returns the LTI 1.3 Advantage registration manifest for Canvas, Moodle, Blackboard, and D2L Brightspace with anonymous privacy defaults.
