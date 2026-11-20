import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import express, { NextFunction, Request, Response } from 'express';
import JSZip from 'jszip';
import multer from 'multer';
import crypto from 'node:crypto';
import type {
  AiProviderId,
  AuthorStylometricProfile,
  CitationEntry,
  DetectionRecord,
  ExclusionFilters,
  HumanizationIntensity,
  PrivacyRuntimeConfig,
  QueueJob,
  UserRole,
  VeritasProofBundle,
} from '../types/veritas.ts';
import { aiRouter } from './aiRouter.ts';
import { buildOpenApiSpec } from './openapi.ts';
import {
  enqueueBatchFilesJob,
  jobEvents,
  runCitationEntailmentPipeline,
  runCodeAnalysisPipeline,
  runCrossLingualPlagiarismPipeline,
  runDetectionPipeline,
  runFactCheckPipeline,
  runHumanizationPipeline,
  runMediaPipeline,
  runSeoAuditForRecord,
  runUrlCrawlPipeline,
  runWebPlagiarismPipeline,
} from './pipeline.ts';
import {
  assertSafeExternalUrl,
  buildSelfHostedProofSvgBadge,
  createSignedVeritasProof,
  inspectAdversarialAndNormalize,
  recalculateWithExclusionFilters,
  redactPiiForExternalAirlock,
  sanitizeCsvCell,
  sanitizeFileName,
  stripPrototypePollutionKeys,
  validateSafeRegexPattern,
  verifyVeritasProofSignature,
} from './security.ts';
import { store } from './store.ts';
import {
  blendAuthorVectors,
  compareAuthorDrift,
  computeAuthorVector,
} from './stylometry.ts';

export interface CreateVeritasAppOptions {
  globalRateLimitRpm?: number;
  strictAuth?: boolean;
}

interface RequestWithActor extends Request {
  actorRole?: UserRole;
  authenticatedViaKey?: boolean;
}

const VALID_ROLES: UserRole[] = ['Admin', 'Researcher', 'Reviewer', 'Viewer'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function buildDocxParagraphsForRecord(record: DetectionRecord): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      text: `Veritas Content Intelligence Report: ${record.title}`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Authenticity: ${record.authenticity?.overallScore ?? '—'}/100 (${record.authenticity?.grade ?? '—'}) · Authorship Verdict: ${record.verdict} (${record.aiProbability}% AI) · Confidence: ${record.confidence}%`,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      text: `Analyzed: ${new Date(record.createdAt).toLocaleString()} · Words: ${record.wordCount} · Language: ${record.detectedLanguage} · Model Signal: ${record.suspectedModelFamily}`,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Forensic Summary', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: record.summary }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Content Quality & Readability', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      text: `Content Quality: ${record.contentQuality?.overallScore ?? record.writingQuality.overall}/100 (${record.contentQuality?.detectedTone ?? 'Neutral'}) | Flesch Reading Ease: ${record.readability.fleschReadingEase} | Flesch-Kincaid Grade: ${record.readability.fleschKincaidGrade} | Coleman-Liau: ${record.readability.colemanLiauIndex} | Burstiness: ${record.writingQuality.burstiness}%`,
    }),
  ];

  if (record.academicIntegrity) {
    paras.push(
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Academic Integrity Report', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        text: `Integrity Score: ${record.academicIntegrity.integrityScore}/100 (${record.academicIntegrity.riskLevel}) | Citation Coverage: ${record.academicIntegrity.citationCoverageScore}% | Paraphrase Integrity: ${record.academicIntegrity.paraphraseIntegrityScore}% | Inline Citations: ${record.academicIntegrity.inlineCitationCount}`,
      })
    );
  }

  if (record.seoAnalysis) {
    paras.push(
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'SEO Optimization Audit', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        text: `SEO Score: ${record.seoAnalysis.overallScore}/100 | Search Intent: ${record.seoAnalysis.searchIntent} | Suggested Title: ${record.seoAnalysis.suggestedTitle}`,
      })
    );
  }

  if (record.factCheck) {
    paras.push(
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'Fact-Check & Source Verification', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        text: `Veracity Score: ${record.factCheck.overallVeracityScore}/100 (${record.factCheck.verifiedCount} verified, ${record.factCheck.disputedCount} disputed)`,
      })
    );
    for (const c of record.factCheck.claims) {
      paras.push(
        new Paragraph({
          text: `[${c.status}] ${c.claim} — ${c.explanation}`,
        })
      );
    }
  }

  paras.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Analyzed Content', heading: HeadingLevel.HEADING_2 })
  );

  for (const block of record.fullText.split(/\n+/)) {
    if (block.trim()) {
      paras.push(new Paragraph({ text: block.trim() }));
    }
  }

  if (record.humanizedVersions && record.humanizedVersions.length > 0) {
    const latest = record.humanizedVersions[0];
    paras.push(new Paragraph({ text: '' }));
    paras.push(
      new Paragraph({
        text: `Latest Humanized Revision (${latest.intensity.toUpperCase()} · ${latest.originalAiScore}% → ${latest.recheckAiScore}% AI)`,
        heading: HeadingLevel.HEADING_2,
      })
    );
    for (const block of latest.humanizedText.split(/\n+/)) {
      if (block.trim()) {
        paras.push(new Paragraph({ text: block.trim() }));
      }
    }
  }

  return paras;
}

export function createVeritasApp(options: CreateVeritasAppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const maxFileBytes = Math.max(
    1024 * 1024,
    Number(process.env.VERITAS_MAX_FILE_BYTES || 100 * 1024 * 1024)
  );
  const maxBatchFiles = Math.max(1, Number(process.env.VERITAS_MAX_BATCH_FILES || 100));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileBytes,
      files: maxBatchFiles,
    },
  });

  // Global security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (process.env.VERITAS_FRAME_DENY === 'true') {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  const jsonLimit = process.env.VERITAS_JSON_LIMIT || '10mb';
  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ extended: true, limit: jsonLimit }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'veritas-content-intelligence', license: 'MIT' });
  });

  app.get('/api/openapi.json', (req, res) => {
    const baseUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL
        : `${req.protocol}://${req.get('host')}`;
    res.json(buildOpenApiSpec(baseUrl));
  });

  // Sliding-window per-IP rate limiter for /api/v1
  const ipWindows = new Map<string, number[]>();
  const globalRpm = Math.max(
    5,
    options.globalRateLimitRpm ?? Number(process.env.VERITAS_GLOBAL_RPM || 600)
  );

  function ipRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - 60_000;
    const history = (ipWindows.get(clientIp) || []).filter((ts) => ts > windowStart);

    res.setHeader('RateLimit-Limit', String(globalRpm));
    if (history.length >= globalRpm) {
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('Retry-After', '60');
      return res.status(429).json({
        error: `Global IP rate limit exceeded (${globalRpm} req/min). Try again shortly.`,
      });
    }
    history.push(now);
    ipWindows.set(clientIp, history);
    res.setHeader('RateLimit-Remaining', String(Math.max(0, globalRpm - history.length)));
    return next();
  }

  // CSRF / Cross-Site Origin Protection on mutating endpoints
  function csrfOriginGuardMiddleware(req: RequestWithActor, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    if (req.authenticatedViaKey) {
      return next();
    }
    const origin = req.headers.origin;
    if (!origin) {
      return next();
    }
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const requestHost = (req.get('host') || '').toLowerCase();
      const allowedFromEnv = (process.env.VERITAS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const appUrlHost =
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? new URL(process.env.APP_URL).host.toLowerCase()
          : '';

      if (
        originHost === requestHost ||
        (appUrlHost && originHost === appUrlHost) ||
        allowedFromEnv.includes(origin.toLowerCase()) ||
        allowedFromEnv.includes(originHost)
      ) {
        return next();
      }
      return res.status(403).json({
        error: 'Cross-origin state-mutating request rejected by CSRF origin guard.',
      });
    } catch {
      return res.status(403).json({ error: 'Invalid Origin header.' });
    }
  }

  // API key authentication + RBAC enforcement
  function authAndRbacMiddleware(req: RequestWithActor, res: Response, next: NextFunction) {
    const apiKeyHeader =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.headers.authorization?.startsWith('Bearer vrt_')
        ? req.headers.authorization.slice(7).trim()
        : undefined);

    const strictAuth = options.strictAuth ?? process.env.VERITAS_REQUIRE_AUTH === 'true';

    if (!apiKeyHeader) {
      if (strictAuth && req.path !== '/lti/config.json') {
        return res.status(401).json({
          error: 'Authentication required: supply x-api-key or Authorization: Bearer vrt_... header.',
        });
      }
      return next();
    }

    const check = store.verifyAndTrackApiKey(apiKeyHeader);
    if (!check.allowed) {
      return res.status(check.status).json({ error: check.message });
    }
    req.actorRole = check.role || 'Admin';
    req.authenticatedViaKey = true;

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (req.actorRole === 'Viewer' && isMutation) {
      return res.status(403).json({ error: 'Forbidden: Viewer API keys are read-only.' });
    }

    const isAdminOnlyResource =
      req.path.startsWith('/keys') ||
      req.path.startsWith('/users') ||
      req.path.startsWith('/audit-logs') ||
      req.path.startsWith('/privacy/erasure');

    const isAdminOnlyMutation =
      req.path.startsWith('/plugins') ||
      req.path.startsWith('/ai-routing') ||
      (req.path === '/privacy-config' && req.method === 'PUT') ||
      (req.path.startsWith('/history/') && req.method === 'DELETE');

    if ((isAdminOnlyResource || (isAdminOnlyMutation && isMutation)) && req.actorRole !== 'Admin') {
      return res.status(403).json({
        error: `Forbidden: "${req.actorRole}" role cannot access or modify administrative configuration.`,
      });
    }

    return next();
  }

  app.use('/api/v1', ipRateLimitMiddleware, authAndRbacMiddleware, csrfOriginGuardMiddleware);

  // 1. Unified Content Intelligence & AI Detection
  app.post('/api/v1/detect', async (req, res) => {
    try {
      const { text, title, targetKeyword } = req.body as {
        text?: string;
        title?: string;
        targetKeyword?: string;
      };
      if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Request body must include non-empty "text".' });
      }
      const record = await runDetectionPipeline({
        text,
        title: typeof title === 'string' ? title : undefined,
        targetKeyword: typeof targetKeyword === 'string' ? targetKeyword : undefined,
        sourceType: 'text',
      });
      res.json(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Detection failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 2. Grounded Fact Checking & Source Verification
  app.post('/api/v1/fact-check', async (req, res) => {
    try {
      const { text, recordId } = req.body as { text?: string; recordId?: string };
      const targetText =
        typeof text === 'string' && text.trim()
          ? text.trim()
          : recordId
            ? store.getRecord(recordId)?.fullText
            : undefined;
      if (!targetText) {
        return res.status(400).json({ error: 'Provide non-empty "text" or a valid "recordId".' });
      }
      const result = await runFactCheckPipeline(targetText, recordId);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fact-check failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 3. Live Web Plagiarism Cross-Check
  app.post('/api/v1/plagiarism-web', async (req, res) => {
    try {
      const { text, recordId } = req.body as { text?: string; recordId?: string };
      const targetText =
        typeof text === 'string' && text.trim()
          ? text.trim()
          : recordId
            ? store.getRecord(recordId)?.fullText
            : undefined;
      if (!targetText) {
        return res.status(400).json({ error: 'Provide non-empty "text" or a valid "recordId".' });
      }
      const result = await runWebPlagiarismPipeline(targetText, recordId);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Web plagiarism check failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 4. Target-Keyword SEO Optimization Audit
  app.post('/api/v1/seo-analyze', (req, res) => {
    try {
      const { text, title, targetKeyword, recordId } = req.body as {
        text?: string;
        title?: string;
        targetKeyword?: string;
        recordId?: string;
      };
      const existing = recordId ? store.getRecord(recordId) : undefined;
      const targetText =
        typeof text === 'string' && text.trim() ? text.trim() : existing?.fullText;
      if (!targetText) {
        return res.status(400).json({ error: 'Provide non-empty "text" or a valid "recordId".' });
      }
      const result = runSeoAuditForRecord(
        targetText,
        (typeof title === 'string' ? title : undefined) || existing?.title,
        typeof targetKeyword === 'string' ? targetKeyword : undefined,
        recordId
      );
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'SEO analysis failed.',
      });
    }
  });

  // 4b. Adversarial Security & PII Airlock Inspection
  app.post('/api/v1/security/inspect', (req, res) => {
    const { text } = req.body as { text?: string };
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Provide non-empty "text" to inspect.' });
    }
    const adv = inspectAdversarialAndNormalize(text);
    const airlock = redactPiiForExternalAirlock(adv.normalizedText);
    res.json({
      report: adv.report,
      normalizedText: adv.normalizedText,
      redactedText: airlock.redactedText,
      redactionCount: airlock.redactionCount,
    });
  });

  // 4c. Interactive Similarity Exclusion Filters
  app.post('/api/v1/exclusions/recalculate', (req, res) => {
    const { recordId, filters } = req.body as {
      recordId?: string;
      filters?: Partial<ExclusionFilters>;
    };
    const record = recordId ? store.getRecord(recordId) : undefined;
    if (!record) {
      return res.status(404).json({ error: 'Detection record not found.' });
    }
    const normalizedFilters: ExclusionFilters = {
      excludeQuotes: Boolean(filters?.excludeQuotes),
      excludeBibliography: Boolean(filters?.excludeBibliography),
      excludeHeaders: Boolean(filters?.excludeHeaders),
      minMatchWords: Math.max(3, Math.min(12, Number(filters?.minMatchWords || 5))),
    };
    res.json(recalculateWithExclusionFilters(record, normalizedFilters, store.getHistory()));
  });

  // 4d. Cross-Language Semantic Plagiarism
  app.post('/api/v1/plagiarism-crosslingual', async (req, res) => {
    try {
      const { text, recordId } = req.body as { text?: string; recordId?: string };
      const targetText =
        typeof text === 'string' && text.trim()
          ? text.trim()
          : recordId
            ? store.getRecord(recordId)?.fullText
            : undefined;
      if (!targetText) {
        return res.status(400).json({ error: 'Provide non-empty "text" or a valid "recordId".' });
      }
      const result = await runCrossLingualPlagiarismPipeline(targetText, recordId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Cross-lingual plagiarism scan failed.',
      });
    }
  });

  // 4e. Claim-to-Source Semantic Entailment Audit
  app.post('/api/v1/citations/entailment', async (req, res) => {
    try {
      const { claim, citationUrl } = req.body as { claim?: string; citationUrl?: string };
      if (typeof claim !== 'string' || !claim.trim() || typeof citationUrl !== 'string' || !citationUrl.trim()) {
        return res.status(400).json({ error: 'Both "claim" and "citationUrl" are required.' });
      }
      const result = await runCitationEntailmentPipeline(claim.trim(), citationUrl.trim());
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Citation entailment check failed.';
      const status =
        /SSRF|Invalid URL|Only public http|embedded credentials|DNS resolution/i.test(msg)
          ? 400
          : 500;
      res.status(status).json({ error: msg });
    }
  });

  // 4f. Source Code AI, AST Similarity & SPDX License Forensics
  app.get('/api/v1/code-reports', (_req, res) => {
    res.json(store.getCodeReports());
  });

  app.post('/api/v1/analyze-code', async (req, res) => {
    try {
      const { code, title, language } = req.body as {
        code?: string;
        title?: string;
        language?: string;
      };
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'Provide source "code" to analyze.' });
      }
      const report = await runCodeAnalysisPipeline(code, title, language);
      res.json(report);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Code forensics failed.',
      });
    }
  });

  // 4g. Sovereign Author Stylometric Twin
  app.get('/api/v1/authorship/profiles', (_req, res) => {
    res.json(store.getAuthorProfiles());
  });

  app.post('/api/v1/authorship/profiles', (req, res) => {
    const { profileId, authorName, departmentOrRole, sampleText } = req.body as {
      profileId?: string;
      authorName?: string;
      departmentOrRole?: string;
      sampleText?: string;
    };
    if (typeof sampleText !== 'string' || sampleText.trim().split(/\s+/).length < 25) {
      return res
        .status(400)
        .json({ error: 'Provide at least 25 words of baseline prose to compute a stylometric vector.' });
    }
    const { vector, wordCount } = computeAuthorVector(sampleText.trim());
    const existing = profileId ? store.getAuthorProfile(profileId) : undefined;
    if (existing) {
      const updated: AuthorStylometricProfile = {
        ...existing,
        sampleCount: existing.sampleCount + 1,
        totalWordsProfiled: existing.totalWordsProfiled + wordCount,
        vector: blendAuthorVectors(existing.vector, existing.sampleCount, vector),
        updatedAt: new Date().toISOString(),
      };
      store.upsertAuthorProfile(updated);
      return res.json(updated);
    }
    if (!authorName?.trim()) {
      return res.status(400).json({ error: 'Provide "authorName" for a new stylometric profile.' });
    }
    const created: AuthorStylometricProfile = {
      id: `prof-${crypto.randomUUID().slice(0, 8)}`,
      authorName: authorName.trim().slice(0, 100),
      departmentOrRole: departmentOrRole?.trim().slice(0, 100) || 'Independent Author',
      sampleCount: 1,
      totalWordsProfiled: wordCount,
      vector,
      updatedAt: new Date().toISOString(),
    };
    store.upsertAuthorProfile(created);
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'STYLOMETRIC_TWIN_CREATED',
      target: created.authorName,
      detail: `Enrolled non-reversible vector (${wordCount} words profiled; raw text discarded)`,
    });
    res.status(201).json(created);
  });

  app.delete('/api/v1/authorship/profiles/:id', (req, res) => {
    const ok = store.deleteAuthorProfile(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Author profile not found.' });
    res.json({ deleted: true });
  });

  app.post('/api/v1/authorship/verify', (req, res) => {
    const { profileId, text } = req.body as { profileId?: string; text?: string };
    const profile = profileId ? store.getAuthorProfile(profileId) : undefined;
    if (!profile) return res.status(404).json({ error: 'Author profile not found.' });
    if (typeof text !== 'string' || text.trim().split(/\s+/).length < 20) {
      return res.status(400).json({ error: 'Provide at least 20 words to compare authorship drift.' });
    }
    const { vector } = computeAuthorVector(text.trim());
    const result = compareAuthorDrift(profile.id, profile.authorName, profile.vector, vector);
    res.json(result);
  });

  // 4h. Veritas Proof: Ed25519 Cryptographic Drafting Attestation & Self-Hosted SVG Seal
  app.get('/api/v1/proofs', (_req, res) => {
    res.json(store.getProofs());
  });

  app.post('/api/v1/proofs/create', (req, res) => {
    const {
      documentTitle,
      authorLabel,
      content,
      durationSeconds,
      keystrokeEvents,
      pasteEvents,
      editBurstCount,
      chunkHashes,
    } = req.body as {
      documentTitle?: string;
      authorLabel?: string;
      content?: string;
      durationSeconds?: number;
      keystrokeEvents?: number;
      pasteEvents?: number;
      editBurstCount?: number;
      chunkHashes?: string[];
    };
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Document content is required to mint a proof bundle.' });
    }
    const keys = store.getSigningKeys();
    const bundle = createSignedVeritasProof({
      documentTitle: (documentTitle?.trim() || 'Untitled Draft').slice(0, 140),
      authorLabel: (authorLabel?.trim() || 'Anonymous Author').slice(0, 100),
      content,
      durationSeconds: Number(durationSeconds || 15),
      keystrokeEvents: Number(keystrokeEvents || content.length),
      pasteEvents: Number(pasteEvents || 0),
      editBurstCount: Number(editBurstCount || 3),
      chunkHashes: Array.isArray(chunkHashes) ? chunkHashes.slice(0, 64) : undefined,
      publicKeyPem: keys.publicKeyPem,
      privateKeyPem: keys.privateKeyPem,
    });
    store.addProof(bundle);
    store.addAuditLog({
      actorName: bundle.authorLabel,
      actorRole: 'Researcher',
      action: 'VERITAS_PROOF_MINTED',
      target: bundle.documentTitle,
      detail: `Ed25519 signed (${bundle.proofId}) · ${bundle.processMetrics.keystrokeEvents} keys · ${bundle.processMetrics.pasteRatioPercent}% paste`,
    });
    res.status(201).json(bundle);
  });

  app.post('/api/v1/proofs/verify', (req, res) => {
    const { bundle, rawContent } = req.body as {
      bundle?: VeritasProofBundle;
      rawContent?: string;
    };
    if (!bundle || !bundle.signature || !bundle.ed25519PublicKey) {
      return res.status(400).json({ error: 'Provide a valid VeritasProofBundle object.' });
    }
    res.json(
      verifyVeritasProofSignature(
        bundle,
        typeof rawContent === 'string' ? rawContent : undefined
      )
    );
  });

  app.get('/api/v1/proofs/:id/badge.svg', (req, res) => {
    const bundle = store.getProof(req.params.id);
    if (!bundle) return res.status(404).send('Proof not found');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buildSelfHostedProofSvgBadge(bundle));
  });

  // 4i. Privacy Runtime Policy, GDPR Erasure, MCP Server & LTI 1.3 Manifest
  app.get('/api/v1/privacy-config', (_req, res) => {
    res.json(store.getPrivacyConfig());
  });

  app.put('/api/v1/privacy-config', (req, res) => {
    const body = stripPrototypePollutionKeys<PrivacyRuntimeConfig>(req.body);
    const updated = store.updatePrivacyConfig({
      mode:
        body.mode === 'local-only'
          ? 'local-only'
          : body.mode === 'hybrid-airlock'
            ? 'hybrid-airlock'
            : undefined,
      scrubPiiBeforeExternal:
        typeof body.scrubPiiBeforeExternal === 'boolean' ? body.scrubPiiBeforeExternal : undefined,
      storeRawText: typeof body.storeRawText === 'boolean' ? body.storeRawText : undefined,
    });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'PRIVACY_POLICY_UPDATED',
      target: 'Sovereign Privacy Airlock',
      detail: `Mode: ${updated.mode} · PII Scrub: ${updated.scrubPiiBeforeExternal} · Store Raw: ${updated.storeRawText}`,
    });
    res.json(updated);
  });

  app.post('/api/v1/privacy/erasure', (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'Provide a valid "userId" for GDPR erasure.' });
    }
    const result = store.eraseUserAndPii(userId.trim());
    if (!result.deleted) {
      return res.status(404).json({ error: 'User not found.' });
    }
    store.addAuditLog({
      actorName: 'Privacy Compliance Officer',
      actorRole: 'Admin',
      action: 'GDPR_ERASURE_COMPLETED',
      target: userId.trim(),
      detail: `Erased user profile · scrubbed ${result.scrubbedRecords} record attribution(s) & ${result.deletedProfiles} stylometric twin(s).`,
    });
    res.json(result);
  });

  app.post('/api/v1/mcp', async (req, res) => {
    const { id, method, params } = req.body as {
      id?: string | number;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id: id ?? 1,
        result: {
          tools: [
            {
              name: 'veritas_detect_text',
              description: 'Run Veritas AI detection, authenticity, quality, and SEO audit on prose.',
            },
            {
              name: 'veritas_check_security',
              description: 'Inspect prose for zero-width smuggling, homoglyphs, prompt injection, and PII.',
            },
            {
              name: 'veritas_verify_proof',
              description: 'Verify an Ed25519 Veritas Proof bundle signature and Merkle root.',
            },
          ],
        },
      });
    }
    if (method === 'tools/call') {
      try {
        const toolName = params?.name;
        const args = params?.arguments || {};
        if (toolName === 'veritas_check_security') {
          const text = String(args.text || '');
          const adv = inspectAdversarialAndNormalize(text);
          return res.json({ jsonrpc: '2.0', id: id ?? 1, result: adv.report });
        }
        if (toolName === 'veritas_verify_proof') {
          const bundle = args.bundle as VeritasProofBundle;
          return res.json({
            jsonrpc: '2.0',
            id: id ?? 1,
            result: verifyVeritasProofSignature(
              bundle,
              typeof args.rawContent === 'string' ? args.rawContent : undefined
            ),
          });
        }
        if (toolName === 'veritas_detect_text') {
          const text = String(args.text || '');
          const rec = await runDetectionPipeline({ text, saveToHistory: false });
          return res.json({
            jsonrpc: '2.0',
            id: id ?? 1,
            result: {
              verdict: rec.verdict,
              aiProbability: rec.aiProbability,
              authenticityScore: rec.authenticity?.overallScore,
              summary: rec.summary,
            },
          });
        }
        return res.json({
          jsonrpc: '2.0',
          id: id ?? 1,
          error: { code: -32601, message: `Unknown MCP tool: ${toolName}` },
        });
      } catch (err: unknown) {
        return res.json({
          jsonrpc: '2.0',
          id: id ?? 1,
          error: { code: -32000, message: err instanceof Error ? err.message : 'MCP execution error' },
        });
      }
    }
    res.json({
      jsonrpc: '2.0',
      id: id ?? 1,
      error: { code: -32601, message: `Unsupported MCP method: ${method}` },
    });
  });

  app.get('/api/v1/lti/config.json', (req, res) => {
    const baseUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL
        : `${req.protocol}://${req.get('host')}`;
    res.json({
      title: 'Veritas Open Integrity & Provenance (LTI 1.3)',
      description: 'Self-hosted, zero-limit AI detection, plagiarism exclusion, code forensics, and cryptographic writing provenance tool for Canvas, Moodle, Blackboard, and D2L Brightspace.',
      oidc_initiation_url: `${baseUrl}/api/v1/lti/login`,
      target_link_uri: baseUrl,
      scopes: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
      ],
      extensions: [
        {
          platform: 'canvas.instructure.com',
          settings: {
            placements: [
              { placement: 'assignment_selection', message_type: 'LtiDeepLinkingRequest' },
              { placement: 'course_navigation', message_type: 'LtiResourceLinkRequest' },
            ],
          },
        },
      ],
      public_jwk_url: `${baseUrl}/api/v1/lti/jwks.json`,
      privacy_level: 'anonymous',
    });
  });

  // 5. Citation Vault & Grounded Lookup
  app.get('/api/v1/citations', (_req, res) => {
    res.json(store.getCitations());
  });

  app.post('/api/v1/citations', async (req, res) => {
    const body = stripPrototypePollutionKeys<CitationEntry>(req.body);
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return res.status(400).json({ error: 'Citation title is required.' });
    }
    let validatedUrl: string | undefined;
    if (typeof body.url === 'string' && body.url.trim()) {
      try {
        validatedUrl = (await assertSafeExternalUrl(body.url.trim(), { skipDns: true })).toString();
      } catch (err) {
        return res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid citation URL.',
        });
      }
    }
    const created = store.addCitation({
      title: body.title.trim().slice(0, 300),
      authors:
        Array.isArray(body.authors) && body.authors.length > 0
          ? body.authors.map((a) => String(a).slice(0, 120)).slice(0, 20)
          : ['Unknown Author'],
      year: String(body.year || new Date().getFullYear()).slice(0, 12),
      publisherOrJournal: String(body.publisherOrJournal || 'Independent Publication').slice(0, 200),
      url: validatedUrl,
      doi: typeof body.doi === 'string' ? body.doi.trim().slice(0, 120) : undefined,
      sourceType:
        body.sourceType === 'Journal Article' ||
        body.sourceType === 'Book' ||
        body.sourceType === 'Report' ||
        body.sourceType === 'Dataset'
          ? body.sourceType
          : 'Web Page',
      verificationStatus:
        body.verificationStatus === 'Verified Source' || body.verificationStatus === 'Unresolved'
          ? body.verificationStatus
          : 'Needs Review',
      linkedRecordId: typeof body.linkedRecordId === 'string' ? body.linkedRecordId : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).slice(0, 40)).slice(0, 15) : [],
    });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'CITATION_SAVED',
      target: created.title,
      detail: `${created.sourceType} · ${created.verificationStatus}`,
    });
    res.status(201).json(created);
  });

  app.post('/api/v1/citations/lookup', async (req, res) => {
    try {
      const { query } = req.body as { query?: string };
      if (typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Provide a paper title, DOI, or URL to verify.' });
      }
      const { value, meta } = await aiRouter.executeCitationLookup({ query: query.trim() });
      res.json({ ...value, routingMeta: meta });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Citation lookup failed.',
      });
    }
  });

  app.delete('/api/v1/citations/:id', (req, res) => {
    const ok = store.deleteCitation(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Citation not found.' });
    res.json({ deleted: true });
  });

  // 6. Single File Analysis (Document or Media)
  app.post('/api/v1/analyze-media', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded under field "file".' });
      }
      const safeName = sanitizeFileName(file.originalname);
      const record = await runMediaPipeline(
        file.buffer,
        safeName,
        file.mimetype || 'application/octet-stream'
      );
      res.json(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Media/document analysis failed.';
      const status = /Rejected executable|Invalid .* signature|Invalid .* magic|Invalid .* header|No readable text/i.test(msg)
        ? 400
        : 500;
      res.status(status).json({ error: msg });
    }
  });

  // 7. Unlimited Batch File Upload & Concurrent Queue Processing
  app.post('/api/v1/detect/batch', upload.array('files'), (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Upload one or more files under field "files".' });
      }
      const concurrency = Number(req.body?.concurrency || 4);
      const job = enqueueBatchFilesJob(
        files.map((f) => ({
          buffer: f.buffer,
          originalname: sanitizeFileName(f.originalname),
          mimetype: f.mimetype,
          size: f.size,
        })),
        concurrency
      );
      res.status(202).json(job);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Batch enqueue failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 8. URL Link Detection & Multi-Page Crawler
  app.post('/api/v1/analyze-url', async (req, res) => {
    try {
      const { url, maxPages } = req.body as { url?: string; maxPages?: number };
      if (typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'Provide a valid http/https URL.' });
      }
      const result = await runUrlCrawlPipeline(url.trim(), Number(maxPages || 1));
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'URL crawl failed.';
      const status =
        /SSRF|Invalid URL|Only public http|embedded credentials|DNS resolution/i.test(msg)
          ? 400
          : 500;
      res.status(status).json({ error: msg });
    }
  });

  // 9. Humanization Engine + Automated Re-Check
  app.post('/api/v1/humanize', async (req, res) => {
    try {
      const { text, intensity, recordId } = req.body as {
        text?: string;
        intensity?: HumanizationIntensity;
        recordId?: string;
      };
      if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Provide text to humanize.' });
      }
      const validIntensity: HumanizationIntensity =
        intensity === 'light' || intensity === 'aggressive' ? intensity : 'moderate';
      const revision = await runHumanizationPipeline(text, validIntensity, recordId);
      res.json(revision);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Humanization failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 10. Queue Jobs & Real-Time SSE Progress
  app.get('/api/v1/jobs', (_req, res) => {
    res.json(store.getJobs());
  });

  app.get('/api/v1/jobs/:id', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json(job);
  });

  app.get('/api/v1/jobs/:id/stream', (req, res) => {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (payload: QueueJob) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send(job);
    if (job.status === 'completed' || job.status === 'failed') {
      res.end();
      return;
    }

    const handler = (updated: QueueJob) => {
      send(updated);
      if (updated.status === 'completed' || updated.status === 'failed') {
        res.end();
      }
    };

    const channel = `job:${req.params.id}`;
    jobEvents.on(channel, handler);
    req.on('close', () => {
      jobEvents.off(channel, handler);
    });
  });

  // 11. History, Analytics & Team Collaboration
  app.get('/api/v1/history', (_req, res) => {
    res.json(store.getHistory());
  });

  app.delete('/api/v1/history/:id', (req, res) => {
    const ok = store.deleteRecord(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Record not found.' });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'RECORD_DELETED',
      target: req.params.id,
      detail: 'Deleted detection record from local history.',
    });
    res.json({ deleted: true });
  });

  app.post('/api/v1/history/:id/comments', (req, res) => {
    const { text, userId } = req.body as { text?: string; userId?: string };
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required.' });
    }
    const users = store.getUsers();
    const actor = users.find((u) => u.id === userId) || users[0] || {
      id: 'usr-system',
      name: 'System Reviewer',
      role: 'Reviewer' as UserRole,
    };
    const updated = store.addComment(req.params.id, {
      id: `cmt-${Date.now()}`,
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      text: text.trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
    });
    if (!updated) return res.status(404).json({ error: 'Record not found.' });
    store.addAuditLog({
      actorName: actor.name,
      actorRole: actor.role,
      action: 'COLLAB_COMMENT_ADDED',
      target: updated.title,
      detail: text.trim().slice(0, 120),
    });
    res.json(updated);
  });

  app.get('/api/v1/analytics', (_req, res) => {
    res.json(store.getAnalytics());
  });

  // 12. Export Endpoints (DOCX + Bulk ZIP with CSV Formula Neutralization)
  app.post('/api/v1/export/docx', async (req, res) => {
    try {
      const { record, humanizedOnly } = req.body as {
        record?: DetectionRecord;
        humanizedOnly?: boolean;
      };
      if (!record || typeof record.fullText !== 'string') {
        return res.status(400).json({ error: 'Missing valid record payload.' });
      }
      const paragraphs =
        humanizedOnly && record.humanizedVersions?.[0]
          ? record.humanizedVersions[0].humanizedText
              .split(/\n+/)
              .filter((p) => p.trim())
              .map((p) => new Paragraph({ text: p.trim() }))
          : buildDocxParagraphsForRecord(record);

      const doc = new Document({
        sections: [{ children: paragraphs }],
      });
      const buf = await Packer.toBuffer(doc);
      const safeFile = sanitizeFileName(record.title || 'veritas-report').replace(/[^a-z0-9_-]/gi, '_');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFile || 'veritas-report'}.docx"`
      );
      res.send(buf);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'DOCX export failed.',
      });
    }
  });

  app.post('/api/v1/export/bulk', async (req, res) => {
    try {
      const { recordIds } = req.body as { recordIds?: string[] };
      const all = store.getHistory();
      const selected =
        Array.isArray(recordIds) && recordIds.length > 0
          ? all.filter((r) => recordIds.includes(r.id))
          : all;
      if (selected.length === 0) {
        return res.status(400).json({ error: 'No records selected for bulk export.' });
      }

      const zip = new JSZip();
      const csvRows = [
        [
          'id',
          'createdAt',
          'sourceType',
          'title',
          'authenticityScore',
          'verdict',
          'aiProbability',
          'contentQualityScore',
          'seoScore',
          'academicIntegrityScore',
          'wordCount',
          'language',
        ].join(','),
      ];

      for (const r of selected) {
        const safeName = r.title.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || r.id;
        zip.file(`json/${safeName}_${r.id}.json`, JSON.stringify(r, null, 2));
        zip.file(
          `txt/${safeName}_${r.id}.txt`,
          `Title: ${r.title}\nAuthenticity: ${r.authenticity?.overallScore ?? '—'}/100\nVerdict: ${r.verdict} (${r.aiProbability}% AI)\nQuality: ${r.contentQuality?.overallScore ?? r.writingQuality.overall}/100\nSEO: ${r.seoAnalysis?.overallScore ?? '—'}/100\nSummary: ${r.summary}\n\n${r.fullText}`
        );
        csvRows.push(
          [
            sanitizeCsvCell(r.id),
            sanitizeCsvCell(r.createdAt),
            sanitizeCsvCell(r.sourceType),
            sanitizeCsvCell(r.title),
            sanitizeCsvCell(r.authenticity?.overallScore ?? ''),
            sanitizeCsvCell(r.verdict),
            sanitizeCsvCell(r.aiProbability),
            sanitizeCsvCell(r.contentQuality?.overallScore ?? r.writingQuality.overall),
            sanitizeCsvCell(r.seoAnalysis?.overallScore ?? ''),
            sanitizeCsvCell(r.academicIntegrity?.integrityScore ?? ''),
            sanitizeCsvCell(r.wordCount),
            sanitizeCsvCell(r.detectedLanguage),
          ].join(',')
        );
      }

      zip.file('summary.csv', csvRows.join('\n'));
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="veritas-bulk-export.zip"');
      res.send(zipBuffer);
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Bulk export failed.',
      });
    }
  });

  // 13. API Keys, Plugins, Users & Audit Logs
  app.get('/api/v1/keys', (_req, res) => {
    res.json(store.getPublicApiKeys());
  });

  app.post('/api/v1/keys', (req, res) => {
    const { name, rateLimitRpm, role } = req.body as {
      name?: string;
      rateLimitRpm?: number;
      role?: UserRole;
    };
    const safeRole: UserRole = role && VALID_ROLES.includes(role) ? role : 'Admin';
    const created = store.createApiKey(
      typeof name === 'string' && name.trim() ? name : 'API Client',
      Number(rateLimitRpm || 120),
      safeRole
    );
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'API_KEY_CREATED',
      target: created.record.name,
      detail: `Prefix ${created.record.prefix}... · Role ${created.record.role} · Rate limit ${created.record.rateLimitRpm} req/min`,
    });
    res.status(201).json(created);
  });

  app.patch('/api/v1/keys/:id', (req, res) => {
    const body = stripPrototypePollutionKeys<{
      active?: boolean;
      rateLimitRpm?: number;
      name?: string;
    }>(req.body);
    const updated = store.updateApiKey(req.params.id, body);
    if (!updated) return res.status(404).json({ error: 'API key not found.' });
    res.json(updated);
  });

  app.delete('/api/v1/keys/:id', (req, res) => {
    const ok = store.deleteApiKey(req.params.id);
    if (!ok) return res.status(404).json({ error: 'API key not found.' });
    res.json({ deleted: true });
  });

  app.get('/api/v1/plugins', (_req, res) => {
    res.json(store.getPlugins());
  });

  app.post('/api/v1/plugins', (req, res) => {
    const { name, description, category, weight, pattern, isRegex } = req.body as {
      name?: string;
      description?: string;
      category?: 'Stylometry' | 'Forensics' | 'Compliance' | 'Custom Rule';
      weight?: number;
      pattern?: string;
      isRegex?: boolean;
    };
    if (typeof name !== 'string' || !name.trim() || typeof pattern !== 'string' || !pattern.trim()) {
      return res.status(400).json({ error: 'Plugin name and pattern are required.' });
    }
    if (Boolean(isRegex)) {
      const check = validateSafeRegexPattern(pattern);
      if (!check.valid) {
        return res.status(400).json({ error: check.reason || 'Unsafe or invalid regex pattern.' });
      }
    }
    const plugin = store.createPlugin({
      name: name.trim(),
      description: typeof description === 'string' ? description : 'Custom rule plugin',
      category: category || 'Custom Rule',
      enabled: true,
      weight: Number(weight || 8),
      pattern: pattern.trim(),
      isRegex: Boolean(isRegex),
    });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'PLUGIN_CREATED',
      target: plugin.name,
      detail: `Weight ${plugin.weight >= 0 ? '+' : ''}${plugin.weight} · ${plugin.isRegex ? 'Regex' : 'Phrase list'}`,
    });
    res.status(201).json(plugin);
  });

  app.patch('/api/v1/plugins/:id', (req, res) => {
    const clean = stripPrototypePollutionKeys<{
      name?: string;
      description?: string;
      category?: 'Stylometry' | 'Forensics' | 'Compliance' | 'Custom Rule';
      enabled?: boolean;
      weight?: number;
      pattern?: string;
      isRegex?: boolean;
    }>(req.body);
    const existing = store.getPlugins().find((p) => p.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Plugin not found.' });

    const nextIsRegex = typeof clean.isRegex === 'boolean' ? clean.isRegex : existing.isRegex;
    const nextPattern = typeof clean.pattern === 'string' ? clean.pattern : existing.pattern;
    if (nextIsRegex && nextPattern.trim()) {
      const check = validateSafeRegexPattern(nextPattern);
      if (!check.valid) {
        return res.status(400).json({ error: check.reason || 'Unsafe or invalid regex pattern.' });
      }
    }

    const updated = store.updatePlugin(req.params.id, clean);
    res.json(updated);
  });

  app.delete('/api/v1/plugins/:id', (req, res) => {
    const ok = store.deletePlugin(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Plugin not found.' });
    res.json({ deleted: true });
  });

  app.get('/api/v1/users', (_req, res) => {
    res.json(store.getUsers());
  });

  app.post('/api/v1/users', (req, res) => {
    const { name, email, role } = req.body as {
      name?: string;
      email?: string;
      role?: UserRole;
    };
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Valid name and email are required.' });
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const user = store.createUser({
      name: name.trim(),
      email: email.trim(),
      role: role || 'Reviewer',
    });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'TEAM_MEMBER_ADDED',
      target: user.email,
      detail: `Role assigned: ${user.role}`,
    });
    res.status(201).json(user);
  });

  app.patch('/api/v1/users/:id', (req, res) => {
    const clean = stripPrototypePollutionKeys<{
      role?: UserRole;
      active?: boolean;
      name?: string;
    }>(req.body);
    if (clean.role !== undefined && !VALID_ROLES.includes(clean.role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const updated = store.updateUser(req.params.id, clean);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    res.json(updated);
  });

  app.delete('/api/v1/users/:id', (req, res) => {
    const result = store.eraseUserAndPii(req.params.id);
    if (!result.deleted) return res.status(404).json({ error: 'User not found.' });
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'GDPR_ERASURE_COMPLETED',
      target: req.params.id,
      detail: `User erased; scrubbed ${result.scrubbedRecords} record(s) and ${result.deletedProfiles} stylometric profile(s).`,
    });
    res.json(result);
  });

  app.get('/api/v1/audit-logs', (_req, res) => {
    res.json(store.getAuditLogs());
  });

  // 14. Resilient Multi-Provider AI Failover, Local-First & Credit Monitoring Router
  const VALID_PROVIDER_IDS: AiProviderId[] = [
    'local-oss',
    'ollama',
    'vllm',
    'lmstudio',
    'openrouter',
    'gemini',
    'openai',
    'anthropic',
    'groq',
    'together',
    'custom',
  ];

  app.get('/api/v1/ai-routing/status', (_req, res) => {
    res.json(aiRouter.getTelemetry());
  });

  app.put('/api/v1/ai-routing/policy', (req, res) => {
    const clean = stripPrototypePollutionKeys<Record<string, unknown>>(req.body);
    const updated = aiRouter.updatePolicy(clean);
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'AI_ROUTING_POLICY_UPDATED',
      target: 'Resilient AI Router',
      detail: `Strategy: ${updated.strategy} · Local Family: ${updated.preferredLocalFamily} · Offline: ${updated.offlineMode} · Cache: ${updated.enableResponseCache}`,
    });
    res.json(updated);
  });

  app.patch('/api/v1/ai-routing/providers/:id', (req, res) => {
    const providerId = req.params.id as AiProviderId;
    if (!VALID_PROVIDER_IDS.includes(providerId)) {
      return res.status(404).json({ error: `Unknown AI provider "${req.params.id}".` });
    }
    const clean = stripPrototypePollutionKeys<Record<string, unknown>>(req.body);
    const updated = aiRouter.updateProvider(providerId, clean);
    if (!updated) {
      return res.status(404).json({ error: `Provider "${req.params.id}" not found.` });
    }
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'AI_PROVIDER_UPDATED',
      target: updated.name,
      detail: `Enabled: ${updated.enabled} · Health: ${updated.health} · Model: ${updated.activeModel} · Balance: $${updated.creditBalanceUsd}`,
    });
    res.json(updated);
  });

  app.post('/api/v1/ai-routing/probe', async (_req, res) => {
    const providers = await aiRouter.probeProviders();
    res.json({ providers, checkedAt: new Date().toISOString() });
  });

  app.post('/api/v1/ai-routing/alerts/ack', (req, res) => {
    const { id } = (req.body || {}) as { id?: string };
    const acknowledgedCount = aiRouter.acknowledgeAlert(
      typeof id === 'string' && id.trim() ? id.trim() : 'all'
    );
    res.json({ acknowledgedCount });
  });

  app.post('/api/v1/ai-routing/queue/process', async (_req, res) => {
    const result = await aiRouter.replayDeferredQueue();
    res.json(result);
  });

  app.delete('/api/v1/ai-routing/cache', (_req, res) => {
    aiRouter.clearCache();
    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'AI_RESPONSE_CACHE_CLEARED',
      target: 'Resilient AI Router',
      detail: 'Cleared SHA-256 inference cache.',
    });
    res.json({ cleared: true });
  });

  // Global error handler — prevents stack trace leakage on malformed JSON, Multer limit breaches, etc.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      return res.status(400).json({ error: 'Malformed JSON request payload.' });
    }
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String((err as { code?: unknown }).code);
      if (code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Uploaded file exceeds configured maximum byte limit.' });
      }
      if (code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files in single batch upload request.' });
      }
    }
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    return res.status(500).json({ error: message });
  });

  return app;
}
