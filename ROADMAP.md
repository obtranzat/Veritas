# Veritas Project Roadmap

Veritas follows an open, privacy-first roadmap focused on exceeding commercial content intelligence platforms without vendor lock-in.

---

## Short-Term Objectives (v3.1 — Next 1–3 Months)

- **Native PostgreSQL Adapter Toggle**: Seamless zero-code switch from JSON store (`data/veritas-store.json`) to PostgreSQL (`schema.sql`) via `DATABASE_URL` with automated migration CLI.
- **Redis-Backed Distributed Queue**: Share batch queue job states (`QueueJob`) and response cache entries across multiple Kubernetes replicas.
- **Expanded Multimodal Local Runners**: Built-in Whisper.cpp and Tesseract HTTP sidecar presets in Helm/Kustomize and health probing in the Failover Router.
- **Webhook Notifications**: Dispatch signed HMAC-SHA256 webhooks when batch jobs complete or AI provider failover alerts trigger.

---

## Medium-Term Objectives (v3.2–v3.5 — 3–6 Months)

- **Multi-Language Stylometric Calibrations**: Dedicated sentence-level stylometric feature weights for Spanish, French, German, Japanese, Mandarin, and Arabic prose.
- **Browser Extension & Google Docs / Word Add-in**: Lightweight extension connecting directly to your self-hosted Veritas node (`x-api-key`) for inline provenance drafting and AI flagging.
- **Streaming SSE Detection Responses**: Progressive token/sentence attribution streaming over SSE for 100k+ word manuscripts.
- **Helm Chart & Terraform Modules**: One-command Terraform modules for AWS ECS/EKS, GCP Cloud Run/GKE, and Azure Container Apps.

---

## Long-Term Objectives (v4.0+ — 6–12 Months)

- **Federated Cryptographic Proof Registry (Opt-In)**: Allow institutions to cross-verify Ed25519 `.veritas-proof.json` public keys via DNS TXT / `.well-known/veritas-keys.json`.
- **On-Device WebGPU Small-Model Classifier**: Optional WebGPU browser worker executing compact perplexity/entropy classification inside the browser tab before upload.
- **Fine-Tuned Open-Weights Evaluation Harness**: Reproducible benchmark suite evaluating open-weight detectors (Llama/Qwen/DeBERTa) across adversarial paraphrasing datasets.

---

Want to help shape the roadmap? Open a proposal in **GitHub Discussions -> Ideas & Roadmap** or submit a feature request using `.github/ISSUE_TEMPLATE/feature_request.yml`.
