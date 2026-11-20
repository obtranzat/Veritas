# Veritas Community Launch Kit & Backlink Growth Playbook

Ready-to-publish launch templates across 9 developer platforms plus a prioritized open-source directory & backlink outreach matrix.

---

## 1. Platform-by-Platform Launch Copy & Playbooks

### A. GitHub Release (`v3.0.0`)
- **Action**: Push annotated tag `git tag v3.0.0 && git push origin v3.0.0` (triggers [`.github/workflows/release.yml`](../../.github/workflows/release.yml)).
- **Checklist**: Apply the 20 core Topics + Social Preview image from [`github-optimization-plan.md`](./github-optimization-plan.md), enable Discussions, and pin the v3.0 announcement.

---

### B. Hacker News (`Show HN`)
**Best Window:** Tuesday–Thursday, 8:00–10:30 AM US Eastern.  
**Title (77 chars):** `Show HN: Veritas – MIT open-source self-hosted alternative to Pangram & GPTZero`  
**Link:** GitHub Repository URL  
**Top Comment (post immediately):**
> Hey HN! I built Veritas (`veritas-content-intelligence`), an MIT-licensed, self-hosted AI detection, content authenticity, and humanization workbench built in TypeScript (Node 22 + React 19 + Express).
>
> **Why:** Every commercial AI detector we looked at enforced strict per-word pricing, blocked bulk PDFs behind enterprise walls, leaked unpublished drafts to SaaS clouds, and lacked non-invasive ways for writers to prove authorship.
>
> **Key engineering choices:**
> - **Offline-first & zero-limit:** Parses unlimited PDF/DOCX/TXT/RTF/ODT/media locally with deterministic stylometry (perplexity variance, burstiness, TTR, hapax ratio) and local Ollama/vLLM/LM Studio models.
> - **11-tier AI failover router (`src/server/aiRouter.ts`):** Catches `402 Payment Required` / `429 RATE_LIMIT_EXCEEDED` / `RESOURCE_EXHAUSTED` and fails over automatically across local and cloud providers with SHA-256 caching and offline job replay.
> - **Adversarial defense:** Normalizes zero-width smuggling, Cyrillic homoglyphs, Bidi spoofing, and prompt injections; redacts PII before external requests.
> - **Cryptographic Ed25519 provenance:** Mints verifiable `.veritas-proof.json` drafting ratios without keystroke logging, plus non-reversible stylometric author twins.
>
> Stack: Node 22, Vite 8, Docker Compose (Postgres, Redis, Whisper, Ollama), Kubernetes HPA, `>=95%` V8 test coverage (`npm run test:coverage`). Happy to answer architecture questions!

---

### C. Product Hunt
**Tagline (59 chars):** `Open-source self-hosted Pangram & GPTZero with zero limits`  
**Topics:** `Artificial Intelligence`, `Open Source`, `Developer Tools`, `Privacy`, `Writing`  
**Gallery Assets:** Upload all 3 screenshots from [`docs/screenshots/`](../screenshots/).  
**Maker First Comment:** Introduce the offline `local-only` privacy guarantee, 3-level humanizer with auto re-check, code AST forensics, and free MIT self-hosting.

---

### D. Reddit

| Subreddit | Angle & Rules Check | Headline Idea |
| :--- | :--- | :--- |
| **`r/selfhosted`** | Emphasize Docker Compose, Postgres/Redis/Ollama/Whisper, zero telemetry, MIT license | `[Release] Veritas v3.0 — Self-hosted AI content detector, plagiarism & humanizer stack (Docker + Ollama + Whisper, MIT, zero limits)` |
| **`r/opensource`** | Emphasize MIT license, architecture, OpenAPI 3.1, MCP & `>=95%` test coverage | `Veritas: Open-source (MIT) alternative to Pangram, GPTZero & Turnitin with 11-tier local-first AI failover` |
| **`r/LocalLLaMA`** | Emphasize Ollama/vLLM/LM Studio support (`Llama`, `Qwen`, `DeepSeek`, `Mistral`, `Gemma`) & `402/429` failover | `Built a local-first AI forensics & content authenticity suite that routes natively to Ollama/vLLM/LM Studio and never dies on cloud 402/429s` |
| **`r/MachineLearning`** | Highlight benchmark F1 methodology (`tests/ai/model-validation.test.ts`), adversarial Unicode/spin defense & AST fingerprinting | `[P] Veritas: Open-source multi-signal text & code AI forensics + adversarial zero-width/homoglyph & paraphrase-spin benchmark` |
| **`r/edtech` / `r/Professors`** | Emphasize LTI 1.3 Canvas/Moodle support, campus-only privacy, quote/bibliography exclusion filters, Ed25519 proofs | `Privacy-first open-source Turnitin & GPTZero alternative with LTI 1.3 and cryptographic student authorship proofs (no spyware)` |

---

### E. X / Twitter Thread Template (6 Posts)
1. **Hook:** Commercial AI detectors charge per word, upload private drafts to unknown clouds, and break when API credits run out. Meet **Veritas v3.0**: 100% open-source (MIT), self-hosted, and zero artificial limits. (Attach `intelligence-hub.jpg`)
2. **Multimodal + Unlimited:** Drop unlimited PDFs, DOCX, URLs, images (EXIF+OCR), audio, video, or source code—get sentence attribution, readability (6 formulas), SEO/GEO & plagiarism checks in one local dashboard.
3. **Humanizer + Auto Re-Check:** Rewrite AI-flagged prose (`Light`, `Moderate`, `Aggressive`) while preserving facts, and automatically re-run detection side-by-side.
4. **Never Fail on `402` or `429`:** Veritas ships an 11-tier local-first AI failover router (Local OSS -> Ollama -> vLLM -> LM Studio -> OpenRouter -> Gemini -> OpenAI -> Anthropic -> Groq -> Together) with SHA-256 caching & offline job queues. (Attach `failover-router.jpg`)
5. **Cryptographic Provenance:** Stop invasive keyloggers. Writers can mint Ed25519 `.veritas-proof.json` attestation bundles & self-hosted SVG badges cleanly. (Attach `provenance-studio.jpg`)
6. **CTA:** Spin it up in 2 minutes (`git clone` -> `npm run dev` or `docker compose up -d`). Link to GitHub repo & `/api/docs`.

---

### F. LinkedIn Post Template
Focus on **institutional privacy, GDPR/FERPA compliance, SPDX code license governance, and zero recurring SaaS seat cost**. Target CTOs, university CIOs, publishing editors, and DevSecOps leads. Include architecture diagram summary and link to `docs/security-guide.md`.

---

### G. Long-Form Technical Articles (Dev.to, Hashnode, Medium)
- **Canonical Strategy**: Always publish first on your primary docs/blog domain or GitHub Pages with `<link rel="canonical">`, then syndicate to **Dev.to**, **Hashnode**, and **Medium** setting the `canonical_url` field to build domain authority without duplicate-content penalties.
- **Dev.to Tags**: `#opensource`, `#ai`, `#typescript`, `#selfhosted`
- **Hashnode / Medium Series**:
  1. *"Building an 11-Tier Local-First AI Failover Router That Survives `402 Payment Required`"*
  2. *"Inside Veritas: Detecting Invisible Zero-Width & Homoglyph Attacks on AI Detectors"*
  3. *"Replace Black-Box SaaS Detectors with an MIT Self-Hosted Stack in Docker Compose"*

---

## 2. Backlink & Directory Submission Matrix

Submit pull requests and directory listings systematically during **Weeks 1–4**:

| Directory Category | Target Platform / Repository | Submission Action & Keyword Anchor |
| :--- | :--- | :--- |
| **Self-Hosted Awesome Lists** | `awesome-selfhosted/awesome-selfhosted` (GitHub PR) | Submit under *Document Management / Analytics / AI Tools* citing MIT License, Docker Compose & `nodejs` stack |
| **Open-Source Awesome Lists** | `sindresorhus/awesome`, `awesome-ai`, `awesome-mcp-servers`, `awesome-nodejs` | Submit PR referencing MCP JSON-RPC endpoint (`/api/v1/mcp`) and open-source AI forensics |
| **Open-Source Software Alternatives** | **AlternativeTo** (`alternativeto.net`) | Add Veritas as an open-source self-hosted alternative to Pangram, GPTZero, Originality.ai, Turnitin, Copyleaks, Winston AI, ZeroGPT |
| **Open-Source SaaS Directories** | **OpenAlternative** (`openalternative.co`), **OSS Insight**, **OpenSourceProjects.dev** | Submit GitHub repo URL with Docker & TypeScript stack tags |
| **Self-Hosted Community Indexes** | **Selfh.st** (`selfh.st/apps`), **awesome-sysadmin** | Submit Docker image specs & non-root security notes |
| **AI Tool Directories** | **There's An AI For That**, **Futurepedia**, **Toolify.ai**, **Hugging Face Spaces** | List under *AI Content Detection*, *Academic Integrity*, and *GEO Tools* |
| **Developer & DevOps Indexes** | **StackShare**, **Artifact Hub** (if packaging K8s Helm chart), **Docker Hub** | Publish verified multi-arch Docker image `veritasoss/veritas:3.0.0` |
| **Academic & University Communities** | **EDUCAUSE Showcase**, **Canvas Community / LTI Directory**, **Moodle Plugins Forum** | Share `/api/v1/lti/config.json` self-hosted integration guide |
| **Package Registries** | **npm** (`veritas-content-intelligence`) | Publish TypeScript CLI/SDK wrapper linking back to GitHub README & API docs |
