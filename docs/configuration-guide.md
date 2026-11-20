# Configuration Guide

Veritas is configured via environment variables (`.env` or container environment) and live runtime governance settings persisted in `data/veritas-store.json`.

---

## 1. Environment Variable Reference

### Server & Persistence
- **`PORT`** (Default: `3000`) — TCP port bound by Express (`0.0.0.0`).
- **`NODE_ENV`** (`development` | `production`) — Set to `production` to disable Vite dev middleware, serve compiled `dist/`, and enable `Strict-Transport-Security`.
- **`APP_URL`** — Canonical external HTTPS URL used in OpenAPI server metadata and LTI 1.3 redirects.
- **`VERITAS_DATA_DIR`** (Default: `./data`) — Directory storing `veritas-store.json`. Mount as a persistent volume in Docker/Kubernetes.

### Upload Limits (No Artificial Plan Caps)
- **`VERITAS_MAX_FILE_BYTES`** (Default: `104857600` = 100 MB) — Adjust upward based on host RAM (e.g., `524288000` for 500 MB video files).
- **`VERITAS_MAX_BATCH_FILES`** (Default: `100`) — Max files accepted per `/api/v1/detect/batch` request.
- **`VERITAS_JSON_LIMIT`** (Default: `10mb`) — Express JSON body size limit.

### Security & Auth
- **`VERITAS_REQUIRE_AUTH`** (`false` | `true`, Default: `false`) — When `true`, mutating/sensitive `/api/v1/*` routes require a valid `x-api-key` or `Authorization: Bearer vrt_live_...` header (issue keys in **API, MCP & LTI** or bootstrap before enabling).
- **`VERITAS_GLOBAL_RPM`** (Default: `600`) — Per-IP sliding-window limit across `/api/v1/*`.
- **`VERITAS_FRAME_DENY`** (`false` | `true`, Default: `false`) — Set `true` in standalone deployments to set `X-Frame-Options: DENY`.

### Local Open-Source Inference (Tiers 2–4)
- `OLLAMA_BASE_URL` (e.g. `http://127.0.0.1:11434`) & `OLLAMA_MODEL` (e.g. `llama3.2`, `qwen2.5:14b`, `deepseek-r1:8b`, `mistral:7b`, `gemma3:12b`)
- `VLLM_BASE_URL` (e.g. `http://127.0.0.1:8000`) & `VLLM_MODEL`
- `LMSTUDIO_BASE_URL` (e.g. `http://127.0.0.1:1234`) & `LMSTUDIO_MODEL`

### Cloud Failover Providers (Tiers 5–11, Optional)
Each cloud provider supports `*_API_KEY`, `*_MODEL`, and `*_CREDIT_BUDGET_USD`:
- OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_CREDIT_BUDGET_USD`)
- Gemini (`GEMINI_API_KEY`, `GEMINI_CREDIT_BUDGET_USD`)
- OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_CREDIT_BUDGET_USD`)
- Anthropic (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_CREDIT_BUDGET_USD`)
- Groq (`GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_CREDIT_BUDGET_USD`)
- Together AI (`TOGETHER_API_KEY`, `TOGETHER_MODEL`, `TOGETHER_CREDIT_BUDGET_USD`)
- Custom OpenAI-compatible (`CUSTOM_AI_BASE_URL`, `CUSTOM_AI_API_KEY`, `CUSTOM_AI_MODEL`, `CUSTOM_AI_CREDIT_BUDGET_USD`)

---

## 2. Live Runtime Policy Controls (UI & API)

- **Privacy Airlock (`PUT /api/v1/privacy-config`)**:
  - `mode`: `"hybrid-airlock"` (redacts PII before optional external LLM calls) or `"local-only"` (zero external network calls).
  - `scrubPiiBeforeExternal`: Toggle email/phone/SSN/API-key masking.
  - `storeRawText`: Disable if institutional compliance requires discarding raw submitted prose after scoring.
- **AI Failover Routing (`PUT /api/v1/ai-routing/policy`)**:
  - `strategy`: `"local-first"` | `"cheapest"` | `"fastest"` | `"highest-quality"`
  - `preferredLocalFamily`: `"llama"` | `"qwen"` | `"deepseek"` | `"mistral"` | `"gemma"`
  - `preemptiveCreditSwitchUsd`: Automatically failover before provider credits hit zero (`0`–`50` USD).
  - `offlineMode`: Force local-only inference and defer cloud tasks (fact-checking, web plagiarism, live DOI lookup) to replay queue.
  - `enableResponseCache`: Enable SHA-256 response deduplication (`cacheTtlSeconds`, default `900`).
