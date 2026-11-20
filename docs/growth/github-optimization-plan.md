# Veritas GitHub Optimization & Trending Playbook

Complete specification for maximizing repository discoverability in GitHub Search, GitHub Explore, GitHub Trending, and social unfurls.

---

## 1. Repository Name, Description & About Section

### Repository Slug
- **Primary**: `veritas` (under org `veritas-oss/veritas` or `gaikhomun/veritas`)
- **NPM Package Name**: `veritas-content-intelligence`

### GitHub "About" Description (Max 350 chars — 249 chars exact)
> Open-source, self-hosted AI detector & content intelligence platform. Free alternative to Pangram, GPTZero & Originality.ai with unlimited uploads, AI humanizer, fact-checking, SEO/GEO, Ed25519 authorship proofs & local Ollama/vLLM 11-tier failover.

### GitHub Website URL Field
- Point to interactive docs or live sandbox: `https://veritas-oss.github.io/veritas` (or active Cloud Run / self-hosted URL)

### Social Preview Image (`1280 × 640px` / `16:9`)
- **Asset Ready**: [`docs/screenshots/intelligence-hub.jpg`](../screenshots/intelligence-hub.jpg) and [`public/og-preview.jpg`](../../public/og-preview.jpg).
- **Upload Path**: `GitHub Repository -> Settings -> General -> Social preview -> Upload image`.

---

## 2. 30 GitHub Topics (Ordered by Search Volume & Relevance)

Copy-paste directly into **Repository About -> Topics** (GitHub permits up to 20 active topics per repo; prioritize #1–#20 in repo settings and rotate #21–#30 in release tags and awesome-list PRs):

1. `ai-detector`
2. `ai-content-detection`
3. `open-source`
4. `self-hosted`
5. `ai-humanizer`
6. `pangram-alternative`
7. `gptzero-alternative`
8. `originality-ai-alternative`
9. `turnitin-alternative`
10. `plagiarism-checker`
11. `fact-checking`
12. `content-authenticity`
13. `ollama`
14. `vllm`
15. `local-llm`
16. `stylometry`
17. `generative-engine-optimization`
18. `seo-analysis`
19. `academic-integrity`
20. `ed25519`
21. `code-forensics`
22. `ast-fingerprinting`
23. `prompt-injection-detection`
24. `privacy-first`
25. `mcp-server`
26. `lti-integration`
27. `docker-compose`
28. `kubernetes`
29. `typescript`
30. `mit-license`

---

## 3. Releases, Tags, Discussions & Wiki Optimization

### Semantic Tags & Release Strategy
- **Tag Format**: Strictly `vMAJOR.MINOR.PATCH` (`v3.0.0`, `v3.0.1`, `v3.1.0`) — triggers automated [`.github/workflows/release.yml`](../../.github/workflows/release.yml).
- **Release Title Format** (SEO-optimized): `v3.0.0 — Self-Hosted AI Detector, Ed25519 Provenance & 11-Tier Ollama/Cloud Failover`
- Include **"What Changed"**, **"Upgrade One-Liner"**, **"Docker Pull Command"**, and **"Contributor Shout-Outs"** in every release note.

### GitHub Discussions Configuration
Enable Discussions with exact categories in [`.github/DISCUSSION_CATEGORIES.md`](../../.github/DISCUSSION_CATEGORIES.md):
- Pin **"Welcome to Veritas v3.0 — Quick Start & Roadmap"** in `Announcements`.
- Pin **"How Veritas compares to Pangram / GPTZero on F1 & privacy"** in `Show and Tell`.
- Convert every answered `troubleshooting` question into a curated `Q&A` entry so Google indexes Long-Tail answers.

### GitHub Wiki Mirroring
Sync all files in `docs/` using [`docs/community-and-wiki.md`](../community-and-wiki.md) so Google indexes both repository Markdown pages and `.wiki` pages.

---

## 4. GitHub Trending Optimization Playbook

GitHub Trending ranks repositories by **velocity of stars, forks, unique visitors, and commit/issue activity** inside 24h / 7d / 30d windows.

### Star & Fork Velocity Loops
1. **Staged Community Launch Window**: Coordinate Hacker News (`Show HN`), `r/selfhosted`, `r/LocalLLaMA`, `X/Twitter` video thread, and Product Hunt inside a single **48-hour launch window** rather than dripping links across separate weeks.
2. **Fork-Friendly Self-Hosting Templates**: Provide one-click `Deploy to Docker` / `Deploy with Kustomize` / `Use MCP Config` instructions in the top fold of `README.md` (drives developer forks & clones).
3. **Interactive Good First Issues**: Maintain 8–12 labeled `good first issue` tickets (e.g., *"Add Spanish punctuation stylometry heuristics"*, *"Add HuggingFace TGI preset to Tier 11"*, *"Add Zotero CSL citation importer"*).

### Release & Contribution Cadence
- **Bi-Weekly Minor Releases (`v3.x.0`)**: Keep a steady cadence of 2–4 merged PRs per week + patch/minor tag every 14 days so "Updated recently" badges and Watch notifications drive repeat engagement.
- **Automated Coverage & Benchmark Badges**: Display live CI status, `>=95%` V8 coverage validation, MIT license, Node `>=22`, and OpenAPI `3.1.0` badges cleanly at the top of `README.md`.
