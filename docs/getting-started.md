# Getting Started with Veritas

Get Veritas running locally in under three minutes with **zero external accounts or API keys**.

## Step 1: Clone & Install

```bash
git clone https://github.com/obtranzat/Veritas.git
cd Veritas
npm install --legacy-peer-deps
cp .env.example .env
```

## Step 2: Launch Veritas

```bash
npm run dev
```

Visit **http://localhost:3000**.

## Step 3: Run Your First Content Intelligence Scan

1. Stay on **Core Forensics -> Intelligence Hub** (default view).
2. Click **AI Sample** or **Human Sample** (or paste your own text / switch to **Upload Document** to drop a PDF, DOCX, TXT, RTF, ODT, or HTML file).
3. Click **Analyze Content**.
4. Inspect the multi-tab report:
   - **Sentence Analysis**: Click any sentence to view burstiness, transition-marker flags, and AI probability.
   - **Content Quality**: View tone, depth, Flesch Reading Ease, Gunning Fog, and sentence distribution.
   - **Fact & Web Plagiarism**: Extract claims or compare against web sources.
   - **SEO & GEO**: Inspect keyword density, SERP preview, and Generative Engine Optimization readiness.
   - **Academic Integrity**: Toggle live **Quote / Bibliography / Header Exclusion Filters** and export a PDF/DOCX/JSON/CSV report.

## Step 4: Try Local-Only Air-Gapped Mode

1. Open **Platform & Governance -> Privacy & Team**.
2. Switch **Processing Egress Mode** to **Strict Local-Only**.
3. Open **Platform & Governance -> AI Failover & Local** to observe Tier #1 Built-In OSS execution (or connect Ollama at `http://127.0.0.1:11434`).
