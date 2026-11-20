# Veritas System Architecture

Veritas is a modular full-stack TypeScript application running a React 19 single-page frontend (`src/`) and an Express 4 REST/SSE/MCP backend (`server.ts` -> `src/server/app.ts`).

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
  subgraph Client["Browser SPA (React 19 + Tailwind v4)"]
    APP["App.tsx (Navigation, Global Search Cmd+K, Identity Switcher)"]
    CORE["AnalyzerWorkspace (Immediate Chunk)"]
    LAZY["13 Lazy Workspaces (Batch, Crawler, Media, Humanizer, Fact, SEO, Academic, Code, Provenance, History, API/MCP, Failover Router, Privacy/Team)"]
    EXPORT["exportClient.ts (PDF via jsPDF, CSV, TXT, JSON, DOCX, ZIP)"]
  end

  subgraph Server["Express 4 Node.js Server (:3000)"]
    SEC_MW["Security Middleware (Headers, IP Rate Limit, CSRF Guard, Bearer Auth + RBAC)"]
    ROUTES["REST + SSE + MCP JSON-RPC + LTI 1.3 Routes"]
    PARSERS["parsers.ts (unpdf, mammoth, cheerio, RTF/ODT, Image/Media EXIF)"]
    PIPE["pipeline.ts (AI Detection, Spin, SEO/GEO, Academic, Fact, Humanizer)"]
    CODE["codeAnalysis.ts (AST Fingerprints, Cyclomatic, SPDX Licenses)"]
    STYL["stylometry.ts (Cadence Vectors, Cosine Drift, Burstiness)"]
    CRYPTO["security.ts (SSRF, PII Airlock, ReDoS, Ed25519 Proofs, SVG Badges)"]
    ROUTER["aiRouter.ts (11-Tier Provider Failover, Cache, Credit Guardrails, Offline Queue)"]
    STORE["store.ts (Atomic JSON Store / PostgreSQL Schema Compatibility)"]
  end

  Client -->|HTTP / Multipart / SSE| SEC_MW --> ROUTES
  ROUTES --> PARSERS
  ROUTES --> PIPE
  ROUTES --> CODE
  ROUTES --> CRYPTO
  PIPE --> STYL
  PIPE --> ROUTER
  ROUTES --> STORE
```

---

## 2. Persistence & Database Schema

Veritas persists state immediately to `data/veritas-store.json` (configurable via `VERITAS_DATA_DIR`) using atomic writes, and ships a matching relational [`schema.sql`](schema.sql) for PostgreSQL 16 deployments:

```mermaid
erDiagram
  USERS ||--o{ DETECTIONS : "creates / reviews"
  USERS ||--o{ COMMENTS : "authors"
  DETECTIONS ||--o{ COMMENTS : "has"
  DETECTIONS ||--o{ CITATIONS : "links"

  USERS {
    text id PK
    text name
    text email UK
    text role
    boolean active
  }
  DETECTIONS {
    text id PK
    text source_type
    text title
    text full_text
    numeric ai_probability
    text verdict
    jsonb sentences
    jsonb authenticity
    jsonb academic_integrity
    jsonb seo_analysis
    jsonb geo_analysis
  }
  CODE_REPORTS {
    text id PK
    text language
    numeric ai_code_probability
    text ast_fingerprint
    integer cyclomatic_complexity
  }
  AUTHOR_PROFILES {
    text id PK
    text author_name
    integer sample_count
    jsonb vector
  }
  VERITAS_PROOFS {
    text proof_id PK
    text content_sha256
    text ed25519_public_key
    text signature
    jsonb process_metrics
  }
  API_KEYS {
    text id PK
    text prefix
    text key_hash UK
    integer rate_limit_rpm
    boolean active
  }
```

---

## 3. 11-Tier AI Model Routing & Failover Architecture

`src/server/aiRouter.ts` decouples all AI intelligence calls from any single cloud vendor:

```mermaid
flowchart TD
  REQ["Pipeline Inference Request (task: detection | humanize | factcheck | media | citation | code)"] --> PRIV{"Privacy Mode = local-only<br/>or Offline Mode?"}
  PRIV -->|Yes| TIER1["Execute Local Tiers Only (1-4) or Enqueue Deferred Cloud Job"]
  PRIV -->|No| CACHE{"SHA-256 Cache Hit?<br/>(TTL <= 900s)"}
  CACHE -->|Hit| RET_CACHE["Return Cached Payload ($0, 0ms)"]
  CACHE -->|Miss| ORDER["Rank Eligible Providers by Strategy:<br/>local-first | cheapest | fastest | highest-quality"]
  ORDER --> EXEC["Execute Highest-Ranked Healthy Provider"]
  EXEC -->|Success| SAVE["Update Latency/Spend + Store in Cache"]
  EXEC -->|402 / RESOURCE_EXHAUSTED / QUOTA / 429 / BILLING| TRIP["Trip Circuit-Breaker Cooldown + Emit Admin Alert + Log Failover"]
  TRIP --> NEXT{"Next Provider Available?"}
  NEXT -->|Yes| EXEC
  NEXT -->|No / Local Backstop| OSS["Tier #1 Built-In OSS Engine (Deterministic Fallback)"]
```

### Provider Hierarchy
1. **Tier 1**: Built-in Local Open-Source Stylometry & Heuristic Engine (always healthy, `$0.00`)
2. **Tier 2**: Ollama (`OLLAMA_BASE_URL`, default `http://127.0.0.1:11434`)
3. **Tier 3**: vLLM (`VLLM_BASE_URL`, default `http://127.0.0.1:8000`)
4. **Tier 4**: LM Studio (`LMSTUDIO_BASE_URL`, default `http://127.0.0.1:1234`)
5. **Tier 5**: OpenRouter (`OPENROUTER_API_KEY`)
6. **Tier 6**: Google Gemini (`GEMINI_API_KEY`)
7. **Tier 7**: OpenAI (`OPENAI_API_KEY`)
8. **Tier 8**: Anthropic (`ANTHROPIC_API_KEY`)
9. **Tier 9**: Groq (`GROQ_API_KEY`)
10. **Tier 10**: Together AI (`TOGETHER_API_KEY`)
11. **Tier 11**: Custom OpenAI-Compatible Endpoint (`CUSTOM_AI_BASE_URL` + `CUSTOM_AI_API_KEY`)

---

## 4. Security Architecture

1. **Network & Perimeter**: Security response headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, optional `X-Frame-Options: DENY`, production `HSTS`).
2. **SSRF Mitigation**: Every user-supplied URL (`analyze-url`, `citations/entailment`, `plagiarism-web`) passes `assertSafeExternalUrl()` before egress, blocking private CIDRs, loopback, cloud metadata `169.254.169.254`, and non-HTTP(S) schemes.
3. **Authentication & RBAC**: API keys use random prefixes (`vrt_live_...`), stored as SHA-256 digests, verified with `crypto.timingSafeEqual`, and rate-limited per key + per IP.
4. **PII Airlock**: When `hybrid-airlock` is active, emails, phone numbers, SSNs, and API tokens are redacted (`[REDACTED_EMAIL]`, etc.) before optional cloud LLM payloads leave the server.

---

## 5. Scalability Design

- **Stateless Horizontal Scaling**: Detection, parsing, security inspection, stylometry, and code AST pipelines run CPU-in-process and scale linearly behind Kubernetes `HorizontalPodAutoscaler` (`k8s/hpa.yaml`, 2–10 pods).
- **Bundle & Frontend Performance**: `App.tsx` bundles `AnalyzerWorkspace` eagerly and code-splits all 13 secondary workspaces with `React.lazy`, keeping initial load fast even on 3G clients.
- **Large Payloads & Streaming**: Batch queue jobs accept up to 100 files per multipart request by default (adjustable via `VERITAS_MAX_BATCH_FILES` / `VERITAS_MAX_FILE_BYTES`) and stream live worker progress via Server-Sent Events (`/api/v1/jobs/:id/stream`).
