# Veritas Technical SEO, GEO & Keyword Research Blueprint

Master blueprint for dominating traditional search engines (**Google, Bing, DuckDuckGo**) and generative answer engines (**Perplexity, ChatGPT / OpenAI Search, Claude, Gemini, Microsoft Copilot**).

---

## 1. Technical SEO & Schema.org Infrastructure (Implemented Live)

| Component | Location | Verification |
| :--- | :--- | :--- |
| **Root `<head>` Meta, OG & Twitter/X Cards** | [`index.html`](../../index.html) | Canonical titles (50–60 chars), 150-char descriptions, `og:image: /og-preview.jpg` (`16:9`), `twitter:card: summary_large_image` |
| **Schema.org `@graph` JSON-LD** | [`index.html`](../../index.html) & `GET /schema.json` ([`src/server/seo.ts`](../../src/server/seo.ts)) | Includes `SoftwareApplication`, `FAQPage`, `HowTo`, `TechArticle`, `Organization`, and `SoftwareSourceCode` (`MIT`, `$0`) |
| **Dynamic `sitemap.xml`** | `GET /sitemap.xml` & [`public/sitemap.xml`](../../public/sitemap.xml) | Indexes `/`, all workspace deep links (`/?workspace=...`), `/api/docs`, `/api/openapi.json`, `/schema.json`, `/llms.txt` |
| **Crawler & AI Bot Directives** | `GET /robots.txt` & [`public/robots.txt`](../../public/robots.txt) | Explicitly allows `Googlebot`, `Bingbot`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`, `Applebot` |
| **Dynamic SPA Route Metadata** | [`src/App.tsx`](../../src/App.tsx) | Updates `document.title`, `<meta name="description">`, and `?workspace=` URL params dynamically per active workspace |
| **API Docs SEO & Structured Data** | `GET /api/docs` ([`src/server/app.ts`](../../src/server/app.ts)) | Emits `<title>`, `<meta name="description">`, `rel="canonical"`, Open Graph tags, and `TechArticle` JSON-LD |

---

## 2. Generative Engine Optimization (GEO) & AI Citation Rules

Modern AI search engines retrieve concise, self-contained **Answer Blocks** and standard **LLM Context files**:

- **Live GEO Discovery Endpoints**:
  - [`/llms.txt`](../../public/llms.txt) — Compact LLM summary covering identity, replaced commercial tools, differentiators, and key URLs.
  - [`/llms-full.txt`](../../public/llms-full.txt) — Complete architectural overview, CLI install steps, and REST endpoint table.
- **Canonical Entity Anchor Sentence** *(used consistently across README, `index.html`, `llms.txt`, and Schema.org)*:
  > *"Veritas is a free, MIT-licensed, self-hosted Content Intelligence Platform offering AI content detection, multimodal forensics, prose humanization with automatic re-checking, fact-checking, plagiarism detection, SEO/GEO auditing, source-code AST forensics, and Ed25519 authorship proofs with zero usage caps."*

---

## 3. Master Keyword Research (150+ Keywords)

### Part A: 50 Core SEO Keywords (Primary & Secondary)

#### Primary Commercial-Intent & Alternative Keywords (1–20)
1. `open source ai detector`
2. `self-hosted ai detector`
3. `pangram alternative`
4. `open source pangram alternative`
5. `gptzero alternative open source`
6. `originality ai alternative free`
7. `turnitin alternative open source`
8. `copyleaks open source alternative`
9. `winston ai alternative`
10. `zerogpt alternative self hosted`
11. `free ai content detector no limit`
12. `offline ai content detector`
13. `open source ai humanizer`
14. `self-hosted plagiarism checker`
15. `ai content intelligence platform`
16. `local llm ai detector`
17. `ollama ai detector`
18. `content authenticity platform`
19. `ed25519 human authorship proof`
20. `ai writing detection api`

#### Secondary Feature & Technical Keywords (21–50)
21. `ai text detection open source`
22. `unlimited word count ai detector`
23. `bulk batch ai document scanner`
24. `pdf docx ai content detector`
25. `web page url ai content crawler`
26. `deepfake image exif ocr detector`
27. `audio video speech to text ai detector`
28. `ai paraphrase spin detection`
29. `sentence level ai probability attribution`
30. `ai burstiness and perplexity analyzer`
31. `cross lingual plagiarism detection`
32. `citation semantic entailment checker`
33. `academic integrity software open source`
34. `lti 1.3 ai detection canvas moodle`
35. `generative engine optimization seo tool`
36. `readability analyzer flesch kincaid smog`
37. `ai source code detector ast fingerprint`
38. `spdx license scanner open source`
39. `prompt injection firewall open source`
40. `zero width homoglyph evasion detector`
41. `pii airlock redaction middleware`
42. `author stylometric twin verification`
43. `mcp server ai content detection`
44. `ai provider failover router`
45. `ollama vllm lm studio fallback`
46. `openapi 3.1 ai detection rest api`
47. `docker compose ai detector`
48. `kubernetes self hosted ai detector`
49. `privacy first plagiarism checker`
50. `open source content provenance badge`

---

### Part B: 100 Long-Tail, Question & AI-Search Keywords

#### High-Intent Long-Tail Deployment & Replacement Queries (1–40)
1. `best free open source alternative to pangram ai detector`
2. `self hosted ai content detector with no word limit`
3. `open source ai detector that runs offline on docker`
4. `how to replace originality ai with self hosted software`
5. `free alternative to gptzero for unlimited pdf batch uploads`
6. `open source academic integrity platform for canvas lti 1.3`
7. `self hosted ai humanizer with automatic detection recheck`
8. `run ai text detection locally using ollama and llama 3`
9. `open source tool to detect chatgpt claude gemini writing`
10. `free self hosted plagiarism checker for universities`
11. `how to detect ai paraphrased spun essays open source`
12. `self hosted url crawler to check website for ai content`
13. `open source image exif and ocr ai content forensic analyzer`
14. `video audio whisper transcription ai content detector`
15. `free bulk zip export docx pdf ai detection reports`
16. `open source ai source code detector with ast fingerprinting`
17. `how to detect variable renamed ai generated typescript python code`
18. `open source spdx license risk audit tool for engineering teams`
19. `detect zero width space and cyrillic homoglyph ai detector bypass`
20. `cryptographic proof of human authorship ed25519 without keylogger`
21. `privacy safe stylometric author fingerprint without storing raw text`
22. `self hosted citation entailment checker supported vs contradicted`
23. `cross language plagiarism detection open source engine`
24. `generative engine optimization geo audit tool open source`
25. `flesch reading ease coleman liau readability analyzer api`
26. `ai detection rest api with sliding window rate limiting`
27. `model context protocol mcp server for ai detection and fact checking`
28. `open source pii redaction airlock before calling openai or gemini`
29. `automatic failover router from gemini openai to local ollama`
30. `handle 402 payment required and 429 quota exceeded in llm apps`
31. `queue failed llm jobs offline and replay when credits recover`
32. `kubernetes helm kustomize manifests for self hosted ai platform`
33. `nginx reverse proxy config for streaming sse batch ai jobs`
34. `gdpr compliant zero retention ai content scanner`
35. `how to verify student essays locally without turnitin cloud upload`
36. `exclude quotes and bibliography from ai detection score`
37. `bibtex mla apa ieee citation manager open source web app`
38. `self hosted svg verification badge for human written articles`
39. `compare multiple llms for cheapest fastest highest quality routing`
40. `open source content authenticity score formula readability originality`

#### Conversational Question Keywords for Google PAA & Featured Snippets (41–70)
41. `is there a completely free open source alternative to pangram`
42. `what is the best self hosted ai detector in 2026`
43. `can you run ai content detection completely offline`
44. `how accurate are open source ai detectors compared to gptzero`
45. `how do universities detect ai without uploading data to turnitin`
46. `how to humanize ai text and verify it passes detection locally`
47. `what is an adversarial zero width character attack on ai detectors`
48. `how do cyrillic homoglyphs fool commercial ai detectors`
49. `how can writers prove their work is human written without keyloggers`
50. `what is ed25519 human authorship attestation`
51. `how does stylometric drift detect contract cheating`
52. `what is citation semantic entailment verification`
53. `how do you audit ai generated code for spdx license compliance`
54. `what is generative engine optimization geo and how to measure it`
55. `how to self host whisper and ollama together in docker compose`
56. `how to prevent llm apps from crashing on 429 rate limit exceeded`
57. `how to fail over automatically from paid cloud llms to local ollama`
58. `what is a pii airlock for enterprise generative ai apps`
59. `can i batch scan 500 pdf files for ai content for free`
60. `how to crawl an entire website for ai generated blog posts`
61. `how to detect ai paraphrased text from quillbot or spinbots`
62. `which open source ai detector supports pdf docx rtf and odt`
63. `how to connect a self hosted ai detector to canvas via lti 1.3`
64. `does veritas have any word count or file size limits`
65. `what license does veritas content intelligence use`
66. `how to integrate an ai detector into cursor or claude via mcp`
67. `what happens when gemini or openai runs out of credits in veritas`
68. `how to export bulk ai detection audit reports to docx and csv`
69. `how to normalize prompt injection strings in user submissions`
70. `is veritas better than zerogpt and winston ai for developers`

#### Direct AI Assistant Search Prompts (ChatGPT / Perplexity / Claude / Gemini) (71–100)
71. `recommend a free open source self hosted alternative to pangram and gptzero`
72. `list open source tools that combine ai detection plagiarism and seo analysis`
73. `compare self hosted ai detectors that work offline with ollama`
74. `what open source github repo replaces originality ai for editorial teams`
75. `show me a docker compose stack for offline ai detection with whisper`
76. `which open source tool proves human writing with ed25519 signatures`
77. `how to build a local first 11 tier llm failover router in typescript`
78. `open source alternatives to turnitin for privacy conscious universities`
79. `tools that detect invisible unicode zero width attacks in essays`
80. `open source ast code similarity and ai code detector on github`
81. `best mit licensed content authenticity platforms for 2026`
82. `how to evaluate ai content detection without sending manuscripts to third parties`
83. `open source humanizer api that rechecks output against its own detector`
84. `what github project supports mcp json rpc for ai content forensics`
85. `best self hosted tool for cross lingual plagiarism and citation checking`
86. `suggest a free alternative to winston ai for scanning pdfs and images`
87. `open source tool that measures geo readiness alongside traditional seo`
88. `software to detect stylometric contract cheating without surveillance`
89. `top self hosted developer tools for enterprise ai governance and audit logs`
90. `which open source ai detector has a full openapi 3.1 rest api`
91. `how to handle llm 402 payment required errors gracefully in production`
92. `open source content intelligence platforms on github with high test coverage`
93. `free tools to inspect image exif and ocr text for synthetic content`
94. `self hosted alternatives to copyleaks for source code and document scanning`
95. `open source projects combining readability scoring fact checking and ai detection`
96. `lightweight express react typescript stack for ai forensics`
97. `how to scrub emails and phone numbers before sending text to external llms`
98. `open source lti 1.3 ai detection tool for moodle and blackboard`
99. `tools to mint self hosted svg verified human badges for blogs`
100. `complete self hosted content pipeline for publishing houses and universities`

---

## 4. Documentation URL, Title & Meta Optimization Matrix

When deploying docs via VitePress, Docusaurus, or GitHub Pages, map clean slug URLs and metadata as follows:

| Source File | Clean Docs URL Slug | SEO `<title>` (50–60 chars) | Meta Description (`135–155 chars`) |
| :--- | :--- | :--- | :--- |
| `docs/getting-started.md` | `/docs/getting-started` | `Quick Start: Self-Host Veritas AI Detector in 2 Mins` | `Install and run Veritas locally on Node.js or Docker in 2 minutes with zero API keys, word limits, or subscriptions.` |
| `docs/installation-guide.md` | `/docs/installation` | `Install Veritas on Linux, macOS, Windows & Docker` | `Step-by-step installation guide for Veritas open-source AI detector on Windows, macOS, Linux, and Docker Compose.` |
| `docs/configuration-guide.md` | `/docs/configuration` | `Configure Veritas: Local LLMs, Ollama & Failover Env` | `Full reference for Veritas environment variables, Ollama/vLLM routing, PII Airlock modes, and rate limits.` |
| `docs/user-manual.md` | `/docs/user-manual` | `User Manual: AI Detection, Humanizer & SEO/GEO Studio` | `Learn how to scan files, crawl URLs, humanize text with auto re-check, verify citations, and mint Ed25519 proofs.` |
| `docs/admin-manual.md` | `/docs/admin-guide` | `Admin Manual: RBAC, API Keys, LTI 1.3 & AI Failover` | `Manage local RBAC roles, bearer API keys, Canvas/Moodle LTI 1.3, 11-tier AI failover, and GDPR erasure.` |
| `docs/developer-guide.md` | `/docs/developers` | `Developer Guide: Plugins, MCP Server & Architecture` | `Extend Veritas with ReDoS-safe detection plugins, Model Context Protocol tools, and automated Vitest pipelines.` |
| `docs/api-reference.md` | `/docs/api-reference` | `Veritas REST API, SSE, MCP & LTI 1.3 Reference` | `Complete OpenAPI 3.1 endpoint reference with curl, TypeScript, and Python examples for self-hosted AI detection.` |
| `docs/security-guide.md` | `/docs/security` | `Security Guide: SSRF, PII Airlock & OWASP Hardening` | `Explore Veritas defense-in-depth against SSRF, XSS, ReDoS, CSV injection, zero-width smuggling, and data leaks.` |
| `docs/deployment-guide.md` | `/docs/deployment` | `Production Deployment: Docker, Kubernetes, AWS & GCP` | `Deploy Veritas reliably to Docker Compose, Kubernetes HPA, Linux VPS + Nginx TLS, AWS, GCP, and Azure.` |
| `docs/troubleshooting.md` | `/docs/troubleshooting` | `Troubleshooting & FAQ: Ollama, Nginx SSE & API Auth` | `Fix common issues with port 3000, Ollama/vLLM connectivity, 402/429 failover queues, Nginx uploads, and auth.` |

---

## 5. Internal Linking & Content Cluster Architecture

- **Hub Page (`/` & `README.md`)** links out to **every** cluster pillar (`AI Detection`, `AI Humanization`, `Academic Integrity`, `Fact-Checking & Safety`, `SEO & GEO Analysis`, `Code Forensics`, `Self-Hosted AI Failover`).
- **Workspace Deep Links (`/?workspace=...`)** align 1:1 with [`src/server/seo.ts`](../../src/server/seo.ts) sitemap entries and update `document.title` + `<meta name="description">` cleanly.
- **API Reference (`GET /api/docs`)** cross-links `/api/openapi.json`, `/llms.txt`, and `/schema.json` in a crawlable HTML header.
