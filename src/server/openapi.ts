export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Veritas Content Intelligence, Security & Provenance API',
      version: '3.0.0',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      description:
        'Open-source, self-hosted REST + MCP + LTI 1.3 ecosystem for AI text/code detection, adversarial evasion defense, cryptographic Ed25519 human-authorship proofs, non-reversible author stylometric twins, grounded fact-checking & citation entailment, cross-lingual plagiarism, SEO/GEO optimization, and privacy-first airlock controls.',
    },
    servers: [{ url: baseUrl || 'http://localhost:3000', description: 'Local / Self-Hosted Node' }],
    components: {
      securitySchemes: {
        BearerApiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'Pass x-api-key or Authorization: Bearer vrt_live_... for headless API clients with per-key rate limits.',
        },
      },
    },
    paths: {
      '/api/v1/detect': {
        post: {
          summary: 'Run full Content Intelligence scan (AI, Authenticity, Quality, GEO/SEO, Academic Integrity, Adversarial Security & AI-Spin)',
          responses: { '200': { description: 'Complete DetectionRecord intelligence report' } },
        },
      },
      '/api/v1/security/inspect': {
        post: {
          summary: 'Run adversarial evasion (zero-width, homoglyphs, Bidi, prompt-injection) and PII airlock inspection',
          responses: { '200': { description: 'AdversarialSecurityReport and redacted preview' } },
        },
      },
      '/api/v1/exclusions/recalculate': {
        post: {
          summary: 'Recalculate AI & plagiarism scores excluding quotes, bibliographies, headers, and matches < N words',
          responses: { '200': { description: 'FilteredScoreResult' } },
        },
      },
      '/api/v1/fact-check': {
        post: {
          summary: 'Verify factual claims and source credibility using live web search grounding',
          responses: { '200': { description: 'FactCheckReport with claim verdicts and verified sources' } },
        },
      },
      '/api/v1/plagiarism-web': {
        post: {
          summary: 'Cross-check distinctive passages against indexed web pages via search grounding',
          responses: { '200': { description: 'Matched external URLs and overlapping excerpts' } },
        },
      },
      '/api/v1/plagiarism-crosslingual': {
        post: {
          summary: 'Detect translated / cross-language plagiarism across major world languages',
          responses: { '200': { description: 'CrossLingualMatch results' } },
        },
      },
      '/api/v1/citations/entailment': {
        post: {
          summary: 'Verify semantic entailment between a factual claim and its cited source URL',
          responses: { '200': { description: 'CitationEntailmentResult (Supported / Contradicted / Not Found)' } },
        },
      },
      '/api/v1/seo-analyze': {
        post: {
          summary: 'Run SEO optimization & Generative Engine Optimization (GEO) audit',
          responses: { '200': { description: 'SeoAnalysisReport + GeoAnalysisReport' } },
        },
      },
      '/api/v1/analyze-code': {
        post: {
          summary: 'Detect AI-generated source code, compute variable-rename-invariant AST fingerprint, and audit SPDX OSS licenses',
          responses: { '200': { description: 'CodeAnalysisReport' } },
        },
      },
      '/api/v1/authorship/profiles': {
        get: { summary: 'List non-reversible Author Stylometric Twin profiles', responses: { '200': { description: 'AuthorStylometricProfile[]' } } },
        post: { summary: 'Enroll or update a privacy-preserving Author Stylometric Twin vector', responses: { '201': { description: 'AuthorStylometricProfile' } } },
      },
      '/api/v1/authorship/verify': {
        post: { summary: 'Compare new submission stylometric vector against baseline author twin for contract cheating/drift', responses: { '200': { description: 'AuthorDriftVerification' } } },
      },
      '/api/v1/proofs/create': {
        post: { summary: 'Mint an Ed25519-signed Veritas Proof Merkle attestation bundle from local drafting metrics', responses: { '201': { description: 'VeritasProofBundle' } } },
      },
      '/api/v1/proofs/verify': {
        post: { summary: 'Cryptographically verify an Ed25519 Veritas Proof bundle and optional raw text SHA-256', responses: { '200': { description: 'Signature & Merkle verification result' } } },
      },
      '/api/v1/proofs/{id}/badge.svg': {
        get: { summary: 'Serve self-hosted SVG human-authorship verification seal', responses: { '200': { description: 'image/svg+xml badge' } } },
      },
      '/api/v1/privacy-config': {
        get: { summary: 'Get active Privacy Airlock & Local-Only runtime policy', responses: { '200': { description: 'PrivacyRuntimeConfig' } } },
        put: { summary: 'Update Privacy Airlock & Local-Only runtime policy', responses: { '200': { description: 'PrivacyRuntimeConfig' } } },
      },
      '/api/v1/mcp': {
        post: { summary: 'Model Context Protocol (MCP) JSON-RPC 2.0 server endpoint for IDE & AI agent integrations', responses: { '200': { description: 'JSON-RPC 2.0 response' } } },
      },
      '/api/v1/lti/config.json': {
        get: { summary: 'LTI 1.3 Advantage Tool Registration manifest for Canvas, Moodle, Blackboard, and D2L', responses: { '200': { description: 'LTI 1.3 JSON configuration' } } },
      },
      '/api/v1/citations': {
        get: { summary: 'List saved bibliographic citations in the local vault', responses: { '200': { description: 'CitationEntry[]' } } },
        post: { summary: 'Save a citation entry to the bibliography vault', responses: { '201': { description: 'Created CitationEntry' } } },
      },
      '/api/v1/citations/lookup': {
        post: { summary: 'Resolve bibliographic metadata from a title, DOI, or URL', responses: { '200': { description: 'Verified CitationEntry metadata' } } },
      },
      '/api/v1/detect/batch': {
        post: { summary: 'Queue unlimited document or media files for parallel processing', responses: { '202': { description: 'Queued job object with SSE stream URL' } } },
      },
      '/api/v1/humanize': {
        post: { summary: 'Humanize prose at light/moderate/aggressive intensity and re-verify', responses: { '200': { description: 'Humanized revision with before/after scores' } } },
      },
      '/api/v1/analyze-url': {
        post: { summary: 'Crawl 1–10 same-origin web pages and run full Content Intelligence analysis', responses: { '200': { description: 'Crawled DetectionRecord results' } } },
      },
      '/api/v1/analyze-media': {
        post: { summary: 'Analyze image (PNG/JPG/WEBP/TIFF), audio, or video files', responses: { '200': { description: 'DetectionRecord with mediaForensics breakdown' } } },
      },
      '/api/v1/history': {
        get: { summary: 'Retrieve full detection and intelligence history', responses: { '200': { description: 'DetectionRecord[]' } } },
      },
      '/api/v1/analytics': {
        get: { summary: 'Aggregate platform authenticity, quality, SEO, and AI detection analytics', responses: { '200': { description: 'AnalyticsSummary' } } },
      },
      '/api/v1/ai-routing/status': {
        get: { summary: 'Get 11-tier AI provider hierarchy health, credit balances, failover history, admin alerts, offline queue, and cache telemetry', responses: { '200': { description: 'AiRoutingTelemetry' } } },
      },
      '/api/v1/ai-routing/policy': {
        put: { summary: 'Update routing strategy (local-first/cheapest/fastest/highest-quality), offline mode, preferred local family, or cache policy', responses: { '200': { description: 'AiRoutingPolicyConfig' } } },
      },
      '/api/v1/ai-routing/providers/{id}': {
        patch: { summary: 'Toggle provider state, reset cooldown, adjust credit budget guardrails, or select active model', responses: { '200': { description: 'AiProviderState' } } },
      },
      '/api/v1/ai-routing/probe': {
        post: { summary: 'Actively probe configured local inference servers (Ollama, vLLM, LM Studio) and cloud credit thresholds', responses: { '200': { description: 'Updated provider health list' } } },
      },
      '/api/v1/ai-routing/alerts/ack': {
        post: { summary: 'Acknowledge one or all administrator failover and credit exhaustion alerts', responses: { '200': { description: 'Acknowledged alert count' } } },
      },
      '/api/v1/ai-routing/queue/process': {
        post: { summary: 'Replay deferred cloud jobs (fact-checks, live web plagiarism, citation lookups) queued during offline/exhausted periods', responses: { '200': { description: 'Queue replay summary' } } },
      },
      '/api/v1/ai-routing/cache': {
        delete: { summary: 'Flush SHA-256 inference response cache', responses: { '200': { description: 'Cache cleared status' } } },
      },
    },
  };
}
