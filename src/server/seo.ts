export function buildSchemaOrgGraph(baseUrl: string) {
  const origin = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const nowIso = '2026-11-20T00:00:00Z';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Veritas Open Source Project',
        url: origin,
        email: 'gaikhomun@gmail.com',
        logo: `${origin}/og-preview.jpg`,
        sameAs: ['https://github.com/veritas-oss/veritas'],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${origin}/#software`,
        name: 'Veritas — Open-Source AI Detector & Content Intelligence Platform',
        alternateName: ['Veritas AI Detector', 'Veritas Content Intelligence'],
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'AI Content Detection, Plagiarism & Provenance Platform',
        operatingSystem: 'Linux, macOS, Windows, Docker, Kubernetes',
        softwareVersion: '3.0.0',
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        url: origin,
        screenshot: `${origin}/og-preview.jpg`,
        description:
          'Free, open-source, self-hosted alternative to Pangram, Originality.ai, GPTZero, and Turnitin with unlimited uploads, AI detection, humanization, fact-checking, plagiarism checks, SEO/GEO optimization, code forensics, Ed25519 authorship proofs, and 11-tier AI failover.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        author: { '@id': `${origin}/#organization` },
        featureList: [
          'AI Text & Paraphrase-Spin Detection',
          'Unlimited Batch File Processing (PDF, DOCX, TXT, RTF, ODT, Images, Audio, Video)',
          '3-Level Humanization Engine with Automatic Re-Verification',
          'Web Page Link Crawler (SSRF-Protected)',
          'Fact-Checking & Citation Semantic Entailment',
          'Web & Cross-Lingual Plagiarism Detection',
          'SEO, GEO & 6-Formula Readability Studio',
          'Source Code AI Detection, AST Fingerprinting & SPDX Audit',
          'Adversarial Zero-Width, Homoglyph & PII Airlock Firewall',
          'Ed25519 Cryptographic Proofs & Non-Reversible Stylometric Twins',
          '11-Tier Local-First AI Provider Failover Router (Ollama, vLLM, LM Studio, Cloud)',
        ],
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': `${origin}/#source-code`,
        name: 'veritas-content-intelligence',
        description:
          'Open-source TypeScript, React 19, Node.js, Express, Docker, and Kubernetes codebase for self-hosted AI detection and content authenticity.',
        codeRepository: 'https://github.com/veritas-oss/veritas',
        programmingLanguage: ['TypeScript', 'JavaScript', 'SQL'],
        runtimePlatform: 'Node.js >= 22',
        license: 'https://opensource.org/licenses/MIT',
        author: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'TechArticle',
        '@id': `${origin}/#architecture-article`,
        headline: 'Veritas Self-Hosted Content Intelligence & 11-Tier AI Failover Architecture',
        description:
          'Technical documentation covering local stylometry, adversarial Unicode defense, Ed25519 Merkle proofs, PII Airlock, and automatic 402/429 AI provider failover.',
        url: `${origin}/api/docs`,
        datePublished: nowIso,
        dateModified: nowIso,
        author: { '@id': `${origin}/#organization` },
        publisher: { '@id': `${origin}/#organization` },
        image: `${origin}/og-preview.jpg`,
      },
      {
        '@type': 'HowTo',
        '@id': `${origin}/#howto-selfhost`,
        name: 'How to Self-Host Veritas Open-Source AI Detector Locally',
        description:
          'Deploy Veritas locally with Node.js or Docker Compose in under two minutes with zero subscriptions or mandatory API keys.',
        totalTime: 'PT2M',
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Clone and install Veritas',
            text: 'Clone the repository, run npm install --legacy-peer-deps, and copy .env.example to .env.',
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Start the local server or Docker Compose stack',
            text: 'Run npm run dev (or docker compose up -d --build) to launch Veritas on port 3000 with optional Ollama and Whisper ASR.',
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Analyze text, files, URLs, or code via UI or REST API',
            text: 'Open http://localhost:3000 or POST JSON/multipart payloads to /api/v1/detect, /api/v1/analyze-media, or /api/v1/humanize.',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${origin}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is Veritas?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Veritas is a free, MIT-licensed, self-hosted Content Intelligence Platform offering AI content detection, multimodal forensics, humanization with automatic re-checking, fact-checking, plagiarism detection, SEO/GEO auditing, code forensics, and Ed25519 authorship proofs with no usage limits.',
            },
          },
          {
            '@type': 'Question',
            name: 'What commercial tools does Veritas replace?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Veritas serves as an unrestricted open-source alternative to Pangram, Originality.ai, GPTZero, Turnitin, Copyleaks, Winston AI, and ZeroGPT.',
            },
          },
          {
            '@type': 'Question',
            name: 'Does Veritas work completely offline without cloud API keys?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. By default Veritas runs in strict local-only mode using deterministic stylometry, AST code fingerprinting, and local open-source inference servers (Ollama, vLLM, LM Studio) with zero outbound cloud calls.',
            },
          },
          {
            '@type': 'Question',
            name: 'How does Veritas handle API rate limits or billing/credit errors?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Veritas includes an 11-tier AI Failover Router that detects 402 Payment Required, RESOURCE_EXHAUSTED, QUOTA_EXCEEDED, RATE_LIMIT_EXCEEDED, BILLING_DISABLED, and INSUFFICIENT_CREDITS errors and automatically fails over to healthy local or alternate providers without interrupting user workflows.',
            },
          },
          {
            '@type': 'Question',
            name: 'Are there any word count, file count, or subscription limits?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. Veritas has zero artificial paywalls, subscriptions, word caps, or file count limits beyond your own server hardware.',
            },
          },
        ],
      },
    ],
  };
}

export function buildRobotsTxt(baseUrl: string): string {
  const origin = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/v1/history',
    'Disallow: /api/v1/users',
    'Disallow: /api/v1/keys',
    'Disallow: /api/v1/audit-logs',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'User-agent: PerplexityBot',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Allow: /',
    'User-agent: Google-Extended',
    'Allow: /',
    'User-agent: Bingbot',
    'Allow: /',
    'User-agent: Applebot',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    `LLMs-Txt: ${origin}/llms.txt`,
    '',
  ].join('\n');
}

export function buildSitemapXml(baseUrl: string): string {
  const origin = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const lastmod = '2026-11-20';
  const urls: { loc: string; priority: string; changefreq: string }[] = [
    { loc: `${origin}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${origin}/?workspace=analyzer`, priority: '0.95', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=humanizer`, priority: '0.90', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=media`, priority: '0.90', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=crawler`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=batch`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=factcheck`, priority: '0.90', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=seo`, priority: '0.90', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=academic`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=code`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=provenance`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/?workspace=resilience`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/api/docs`, priority: '0.85', changefreq: 'weekly' },
    { loc: `${origin}/api/openapi.json`, priority: '0.75', changefreq: 'weekly' },
    { loc: `${origin}/schema.json`, priority: '0.70', changefreq: 'monthly' },
    { loc: `${origin}/llms.txt`, priority: '0.80', changefreq: 'weekly' },
    { loc: `${origin}/llms-full.txt`, priority: '0.75', changefreq: 'weekly' },
  ];

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const items = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}
