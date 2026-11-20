# Veritas End-User Manual

A practical walkthrough of every workspace in Veritas for writers, editors, educators, researchers, and compliance reviewers.

---

## 1. Core Forensics Workspaces

### Intelligence Hub (`analyzer`)
- Paste plain text of **unlimited length** or switch to **Upload Document** (`PDF`, `DOCX`, `TXT`, `RTF`, `ODT`, `MD`, `CSV`, `HTML`).
- Review four top KPI scores: **Authenticity Index**, **AI Probability**, **Content Quality**, and **Readability Grade**.
- Click any highlighted sentence to inspect burstiness, stylometric transition markers, and sentence-level attribution.
- Export results immediately as **PDF**, **DOCX**, **TXT**, **JSON**, or **CSV**.

### Batch Queue (`batch`)
- Drag and drop any number of documents, images, audio, or video files simultaneously.
- Select worker concurrency (`1`–`8` parallel workers) and watch real-time **SSE progress bars** per file.

### Link Crawler (`crawler`)
- Enter any `https://` article or documentation URL and select crawl depth (`1`, `3`, `5`, or `10` same-origin pages).
- Inspect clean extracted prose (navigation boilerplate stripped) and AI scores page by page.

### Media Forensics (`media`)
- Upload **Images** (`PNG`, `JPG`, `JPEG`, `WEBP`, `TIFF`) for EXIF anomaly inspection, synthetic diffusion markers, and OCR text extraction.
- Upload **Audio / Video** (`MP3`, `WAV`, `OGG`, `MP4`, `WEBM`, `MOV`) for transcription + linguistic AI detection.

---

## 2. Quality & Research Workspaces

### Humanizer (`humanizer`)
- Transfer any flagged document directly via **Send to Humanizer** or load from scan history.
- Choose **Light** (gentle syntactic smoothing), **Moderate** (balanced cadence variation), or **Aggressive** (deep structural re-expression) while preserving facts and numbers.
- Veritas automatically re-runs the detection engine on the rewritten text and displays the before/after AI probability delta.

### Fact & Source Lab (`factcheck`)
- **Fact-Check Claims**: Breaks prose into verifiable claims (`Supported`, `Disputed`, `Unverified`) with source credibility ratings.
- **Web & Cross-Language Plagiarism**: Detects web overlaps and translated plagiarism across major languages.
- **Semantic Entailment Auditor**: Checks whether a cited URL actually supports or contradicts a specific claim.

### SEO, GEO & Quality (`seo`)
- Audits primary target keyword density, heading structure, search intent, SERP title/meta snippet preview, and **Generative Engine Optimization (GEO)** entity density and direct-answer readiness.

### Academic & Citations (`academic`)
- View **Academic Integrity Index** (citation coverage, uncited empirical claims, paraphrase integrity).
- Resolve citations by title, DOI, or URL, store them in the local bibliography vault, format in **APA / MLA / Chicago / IEEE / BibTeX**, and export `.bib`.

---

## 3. Security & Provenance Workspaces

### Code & Security (`code`)
- Analyze source code (`TypeScript`, `JavaScript`, `Python`, `Go`, `Rust`, `Java`, `SQL`) for AI generation signals, variable-rename-invariant AST duplication, cyclomatic complexity, and **SPDX license compliance**.
- Test text in the **Adversarial Evasion Firewall** to detect invisible zero-width characters, Cyrillic/Greek homoglyphs, Bidi overrides, prompt injections, and PII leaks.

### Provenance & Auth (`provenance`)
- **Draft Attestation**: Type/edit inside the monitored editor, then click **Mint Ed25519 Veritas Proof** to generate a cryptographic `.veritas-proof.json` seal and embeddable SVG badge.
- **Stylometric Twin**: Enroll non-reversible author cadence vectors (raw baseline text is never stored) and verify new submissions against contract-cheating drift.

---

## 4. History & Quick Search

- Press **`Cmd+K`** (macOS) or **`Ctrl+K`** (Windows/Linux) from anywhere to jump to workspaces, scans, code reports, or proofs.
- Visit **History & Audit** to filter scans by verdict/modality and export selected records as a **Bulk ZIP**.
