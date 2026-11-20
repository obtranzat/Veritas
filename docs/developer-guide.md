# Developer Guide

Architecture and extension guide for contributors building new detectors, AI provider adapters, frontend workspaces, or export formats.

---

## 1. Repository Layout

```text
veritas/
├── server.ts                 # HTTP entry point (Vite dev middleware or static dist/)
├── src/
│   ├── App.tsx               # Shell navigation, Cmd+K palette, lazy workspace routing
│   ├── components/           # Modular React 19 UI workspaces
│   ├── server/
│   │   ├── app.ts            # Express REST/SSE/MCP routes & security middleware
│   │   ├── aiRouter.ts       # 11-tier failover engine, cache, budgets, offline queue
│   │   ├── pipeline.ts       # Unified detection, spin, SEO/GEO, academic, humanizer
│   │   ├── security.ts       # SSRF, PII airlock, ReDoS, CSV sanitize, Ed25519 crypto
│   │   ├── codeAnalysis.ts   # AST tokenization, cyclomatic complexity, SPDX detection
│   │   ├── stylometry.ts     # Cadence vectors, TTR, hapax, cosine similarity drift
│   │   ├── parsers.ts        # PDF, DOCX, ODT, RTF, HTML, EXIF media extractors
│   │   ├── store.ts          # Atomic JSON persistence & seed dataset
│   │   └── openapi.ts        # OpenAPI 3.1 spec generator
│   ├── types/veritas.ts      # Shared client/server TypeScript interfaces
│   └── utils/exportClient.ts # Browser PDF/TXT/JSON/CSV/DOCX/ZIP exporters
├── tests/                    # Vitest (unit, api, security, ai) + Playwright visual tests
├── k8s/                      # Kubernetes deployment manifests
├── examples/                 # curl, TS SDK, Python SDK, MCP, Nginx examples
└── docs/                     # Documentation suite
```

---

## 2. Adding a New AI Provider or Routing Signal

1. Add the provider definition in `src/types/veritas.ts` (`AiProviderId`).
2. Register default configuration & env var mapping inside `buildDefaultProviders()` in `src/server/aiRouter.ts`.
3. Implement its dispatch handler in `dispatchProviderCall()` inside `src/server/aiRouter.ts` (never log keys; pass errors through `classifyProviderFailure()` so `402`/`429`/`QUOTA_EXCEEDED` trigger automatic failover).
4. Add unit tests in `tests/unit/ai-router.test.ts` verifying failure classification and failover behavior.

---

## 3. Adding a New Frontend Workspace

1. Create `src/components/MyWorkspace.tsx` using Tailwind v4 classes (supporting both light and dark modes).
2. Keep every controlled `<input>`, `<select>`, and `<textarea>` bound to non-undefined state (`?? ''` or `Boolean(...)`).
3. Lazy-load the workspace via `React.lazy` inside `src/App.tsx` and add it to `NAV_SECTIONS`.

---

## 4. Adding a New API Endpoint

1. Implement the route in `src/server/app.ts` using existing security helpers (`stripPrototypePollutionKeys`, `assertSafeExternalUrl`, `requireRole`, `validateSafeRegexPattern`).
2. Add the path summary and response contract in `src/server/openapi.ts` and `docs/api-reference.md`.
3. Add integration assertions in `tests/api/endpoints.test.ts` and security assertions in `tests/security/pentest-redteam.test.ts`.
4. Verify `npm run validate:release` passes with `>=95%` V8 coverage.
