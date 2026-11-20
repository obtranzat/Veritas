# Changelog

All notable changes to **Veritas** are documented in this file following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Ongoing model calibration benchmarks and community plugin recipes.

---

## [3.0.0] - 2026-11-20

### Added
- **11-Tier Zero-Downtime AI Provider Failover Router (`aiRouter.ts` & `ResilienceRouterWorkspace`)**:
  - Automatic detection of `402 Payment Required`, `RESOURCE_EXHAUSTED`, `QUOTA_EXCEEDED`, `RATE_LIMIT_EXCEEDED`, `BILLING_DISABLED`, and `INSUFFICIENT_CREDITS`.
  - Priority hierarchy across Built-in Local OSS (`1`), Ollama (`2`), vLLM (`3`), LM Studio (`4`), OpenRouter (`5`), Gemini (`6`), OpenAI (`7`), Anthropic (`8`), Groq (`9`), Together AI (`10`), and Custom OpenAI-compatible endpoints (`11`).
  - Intelligent routing strategies (`local-first`, `cheapest`, `fastest`, `highest-quality`), SHA-256 inference cache, pre-zero credit guardrails, offline deferred queue replay, and admin failover alerts.
- **Cryptographic Provenance & Stylometric Twins (`ProvenanceAuthWorkspace`)**:
  - Ed25519 Merkle attestation bundles (`.veritas-proof.json`), verification endpoint, and self-hosted SVG verification badges (`/api/v1/proofs/:id/badge.svg`).
  - Non-reversible mathematical author cadence vectors and cosine drift detection.
- **Code & Adversarial Security Firewall (`CodeForensicsWorkspace`)**:
  - Variable-rename-invariant AST structural fingerprinting, cyclomatic complexity, SPDX OSS license detection, zero-width smuggling/homoglyph/Bidi firewall, and PII airlock sanitizer.
- **Enterprise Interoperability & Self-Hosting**:
  - Model Context Protocol (**MCP JSON-RPC 2.0** at `/api/v1/mcp`), **LTI 1.3** LMS manifest (`/api/v1/lti/config.json`), interactive `/api/docs` OpenAPI 3.1 explorer, Docker Compose stack, Kubernetes manifests, and GitHub release automation.
- **Quality & Testing**:
  - Route-level `React.lazy` code splitting across secondary workspaces.
  - Vitest + V8 coverage suite exceeding `95%` statements/lines/functions, plus Playwright multi-viewport (`360px` / `768px` / `1440px`) visual regression suite.

### Fixed
- Hardened controlled React `<input>`, `<select>`, and `<textarea>` state hydration across all workspaces and API refresh routines.
- Disabled Vite HMR WebSocket handshake in Express middleware mode (`hmr: false, watch: null`) to prevent spurious dev WebSocket rejections.

---

## [2.0.0] - 2026-10-15

### Added
- Unified Content Intelligence suite: Fact-Checking, Citation Entailment auditing, Live Web & Cross-Lingual Plagiarism detection, SEO & Generative Engine Optimization (GEO), Multi-Index Readability, Academic Integrity Reporting, and Citation/Bibliography Vault (`APA`, `MLA`, `Chicago`, `IEEE`, `BibTeX`, `.bib`).
- Interactive Similarity & AI Exclusion Filters (quotes, bibliography, headers, min N-gram words).
- Local RBAC (`Admin`, `Researcher`, `Reviewer`, `Viewer`), Privacy Airlock modes (`hybrid-airlock`, `local-only`), GDPR erasure, and PostgreSQL `schema.sql`.

---

## [1.0.0] - 2026-09-01

### Added
- Initial MIT open-source release: Plain-text & document AI detection (`PDF`, `DOCX`, `TXT`, `RTF`, `ODT`), Multimodal Media Forensics, Domain Link Crawler, Unlimited Batch Queue with live SSE progress, Light/Moderate/Aggressive Humanizer with auto re-check, and PDF/DOCX/TXT/JSON/CSV/ZIP exports.
