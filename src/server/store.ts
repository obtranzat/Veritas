import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AnalyticsSummary,
  ApiKeyRecord,
  AuditLogEntry,
  AuthorStylometricProfile,
  CitationEntry,
  CodeAnalysisReport,
  CollaborationComment,
  DetectionRecord,
  PluginConfig,
  PrivacyRuntimeConfig,
  QueueJob,
  SourceType,
  TeamUser,
  UserRole,
  VeritasProofBundle,
} from '../types/veritas.ts';
import {
  generateEd25519Keypair,
  inspectAdversarialAndNormalize,
  stripPrototypePollutionKeys,
} from './security.ts';
import {
  buildAcademicIntegrityReport,
  buildContentQualityDeterministic,
  computeAuthorVector,
  computeContentAuthenticity,
  computeDeterministicSeo,
  computeGeoAnalysis,
  computeReadabilityAndQuality,
  detectParaphraseSpin,
  extractInlineCitations,
  mergeSentencesWithModelScores,
  splitSentencesWithOffsets,
} from './stylometry.ts';

interface StoredCodeEntry {
  report: CodeAnalysisReport;
  normalizedTokens: string[];
}

interface StoreData {
  history: DetectionRecord[];
  jobs: QueueJob[];
  apiKeys: ApiKeyRecord[];
  plugins: PluginConfig[];
  users: TeamUser[];
  auditLogs: AuditLogEntry[];
  citations: CitationEntry[];
  codeReports: StoredCodeEntry[];
  authorProfiles: AuthorStylometricProfile[];
  proofs: VeritasProofBundle[];
  privacyConfig: PrivacyRuntimeConfig;
  signingKeys: { publicKeyPem: string; privateKeyPem: string };
}

const DATA_DIR = process.env.VERITAS_DATA_DIR
  ? path.resolve(process.env.VERITAS_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'veritas-store.json');

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function hydrateRecordDefaults(r: DetectionRecord): DetectionRecord {
  const { readability, writingQuality } = computeReadabilityAndQuality(r.fullText || '');
  const mergedReadability = {
    ...readability,
    ...(r.readability || {}),
    sentenceDistribution: r.readability?.sentenceDistribution || readability.sentenceDistribution,
  };
  const inlineCitations = r.extractedCitations || extractInlineCitations(r.fullText || '');
  const contentQuality =
    r.contentQuality ||
    buildContentQualityDeterministic(r.fullText || '', writingQuality, mergedReadability);
  const seoAnalysis =
    r.seoAnalysis || computeDeterministicSeo(r.fullText || '', r.title);
  const academicIntegrity =
    r.academicIntegrity ||
    buildAcademicIntegrityReport(
      r.fullText || '',
      r.aiProbability,
      r.plagiarism?.overallSimilarityPercent || 0,
      mergedReadability
    );
  const authenticity =
    r.authenticity ||
    computeContentAuthenticity({
      humanProbability: r.humanProbability,
      plagiarismSimilarity: r.plagiarism?.overallSimilarityPercent || 0,
      factCheck: r.factCheck,
      inlineCitationCount: inlineCitations.length,
      hasUrlSource: Boolean(r.sourceUrl),
      syntheticMediaProbability: r.mediaForensics?.syntheticProbability,
    });

  const adversarialSecurity =
    r.adversarialSecurity || inspectAdversarialAndNormalize(r.fullText || '').report;
  const paraphraseSpin =
    r.paraphraseSpin ||
    detectParaphraseSpin(r.fullText || '', writingQuality, r.aiProbability);
  const geoAnalysis = r.geoAnalysis || computeGeoAnalysis(r.fullText || '', r.title);

  return {
    ...r,
    readability: mergedReadability,
    extractedCitations: inlineCitations,
    contentQuality,
    seoAnalysis,
    academicIntegrity,
    authenticity,
    adversarialSecurity,
    paraphraseSpin,
    geoAnalysis,
  };
}

function createInitialStore(): StoreData {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const users: TeamUser[] = [
    {
      id: 'usr-elena',
      name: 'Dr. Elena Rostova',
      email: 'elena@veritas.local',
      role: 'Admin',
      avatarUrl: '/src/assets/images/avatar_research_lead_1795063613064.jpg',
      active: true,
      createdAt: twoHoursAgo,
      lastActiveAt: now.toISOString(),
    },
    {
      id: 'usr-arjun',
      name: 'Arjun Mehta',
      email: 'arjun@veritas.local',
      role: 'Researcher',
      avatarUrl: '/src/assets/images/avatar_forensic_engineer_1795063612660.jpg',
      active: true,
      createdAt: twoHoursAgo,
      lastActiveAt: oneHourAgo,
    },
  ];

  const plugins: PluginConfig[] = [
    {
      id: 'plugin-llm-cliches',
      name: 'LLM Transition & Cliché Fingerprint',
      description: 'Flags high-frequency synthetic discourse markers such as "delve into", "tapestry", and "ever-evolving landscape".',
      category: 'Stylometry',
      enabled: true,
      weight: 12,
      pattern: 'delve into, tapestry, ever-evolving landscape, paradigm shift, underscores the importance, testament to',
      isRegex: false,
      createdAt: twoHoursAgo,
    },
    {
      id: 'plugin-low-burstiness',
      name: 'Uniform Sentence Cadence Detector',
      description: 'Triggers when sentence-length variance (burstiness) drops below 32% across multi-paragraph prose.',
      category: 'Stylometry',
      enabled: true,
      weight: 10,
      pattern: '',
      isRegex: false,
      createdAt: twoHoursAgo,
    },
    {
      id: 'plugin-corporate-filler',
      name: 'Synthetic Corporate Lexicon',
      description: 'Detects clustered abstract verbs and adjectives heavily overrepresented in unedited model outputs.',
      category: 'Compliance',
      enabled: true,
      weight: 6,
      pattern: '\\b(leverage|streamline|robust|multifaceted|foster innovation|seamless integration)\\b',
      isRegex: true,
      createdAt: twoHoursAgo,
    },
    {
      id: 'plugin-c2pa-provenance',
      name: 'AI Watermark & Disclosure Scanner',
      description: 'Checks text and metadata for explicit model self-disclosures or prompt artifacts.',
      category: 'Forensics',
      enabled: true,
      weight: 15,
      pattern: 'as an ai language model, generated by, stable diffusion, comfyui, midjourney',
      isRegex: false,
      createdAt: twoHoursAgo,
    },
  ];

  const defaultRawKey =
    process.env.VERITAS_BOOTSTRAP_API_KEY ||
    `vrt_live_${crypto.randomBytes(18).toString('hex')}`;
  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'key-default',
      name: 'Local Self-Hosted CLI Key',
      prefix: defaultRawKey.slice(0, 16),
      keyHash: hashKey(defaultRawKey),
      role: 'Admin',
      createdAt: twoHoursAgo,
      rateLimitRpm: 240,
      requestCount: 0,
      active: true,
    },
  ];

  const citations: CitationEntry[] = [
    {
      id: 'cit-gehrmann-2019',
      title: 'GLTR: Statistical Detection and Visualization of Generated Text',
      authors: ['Sebastian Gehrmann', 'Hendrik Strobelt', 'Alexander M. Rush'],
      year: '2019',
      publisherOrJournal: 'Proceedings of the 57th Annual Meeting of the ACL: System Demonstrations',
      doi: '10.18653/v1/P19-3019',
      url: 'https://aclanthology.org/P19-3019/',
      sourceType: 'Journal Article',
      verificationStatus: 'Verified Source',
      createdAt: twoHoursAgo,
      tags: ['stylometry', 'ai-detection'],
    },
    {
      id: 'cit-mitchell-2023',
      title: 'DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature',
      authors: ['Eric Mitchell', 'Yoonho Lee', 'Alexander Khazatsky', 'Christopher D. Manning', 'Chelsea Finn'],
      year: '2023',
      publisherOrJournal: 'International Conference on Machine Learning (ICML)',
      url: 'https://arxiv.org/abs/2301.11305',
      sourceType: 'Journal Article',
      verificationStatus: 'Verified Source',
      createdAt: twoHoursAgo,
      tags: ['probability-curvature', 'forensics'],
    },
  ];

  const sampleAiText =
    "In today's fast-paced digital landscape, organizations must delve into innovative strategies to streamline operations and foster innovation. Furthermore, it is important to note that artificial intelligence plays a crucial role in transforming multifaceted workflows across industries. Ultimately, leveraging robust automation tools ensures seamless integration and sustainable growth.";
  const sampleHumanText =
    "We spent most of Tuesday debugging why the lab spectrometer kept dropping packets whenever the compressor kicked on. Turned out the shielding on the RS-485 run had split right near the bulkhead clamp, so I spliced in a spare shielded pair from the bench drawer and wrapped the joint in copper tape. Not pretty, but the baseline noise vanished immediately.";

  const aiMetrics = computeReadabilityAndQuality(sampleAiText);
  const aiSplit = splitSentencesWithOffsets(sampleAiText);
  const aiSentences = mergeSentencesWithModelScores(aiSplit);

  const humanMetrics = computeReadabilityAndQuality(sampleHumanText);
  const humanSplit = splitSentencesWithOffsets(sampleHumanText);
  const humanSentences = mergeSentencesWithModelScores(humanSplit);

  const history: DetectionRecord[] = [
    hydrateRecordDefaults({
      id: 'det-baseline-ai',
      createdAt: oneHourAgo,
      sourceType: 'text',
      title: 'Enterprise Automation Draft (Baseline Reference)',
      wordCount: aiMetrics.wordCount,
      characterCount: aiMetrics.characterCount,
      contentPreview: sampleAiText.slice(0, 160),
      fullText: sampleAiText,
      aiProbability: 94.2,
      humanProbability: 5.8,
      confidence: 92,
      verdict: 'AI-Generated',
      suspectedModelFamily: 'GPT-4 / Instruction-Tuned LLM',
      detectedLanguage: 'English',
      languageConfidence: 96,
      summary:
        'High concentration of formulaic transition phrases combined with uniform syntactic rhythm across all sentences. Zero concrete experiential detail or lexical irregularity.',
      sentences: aiSentences,
      readability: aiMetrics.readability,
      writingQuality: aiMetrics.writingQuality,
      plagiarism: { overallSimilarityPercent: 0, matches: [] },
      pluginFindings: [
        {
          pluginId: 'plugin-llm-cliches',
          pluginName: 'LLM Transition & Cliché Fingerprint',
          triggered: true,
          scoreDelta: 12,
          findings: ['Phrase "delve into"'],
        },
      ],
      humanizedVersions: [],
      comments: [
        {
          id: 'cmt-1',
          userId: 'usr-elena',
          userName: 'Dr. Elena Rostova',
          userRole: 'Admin',
          text: 'Confirmed synthetic baseline sample for calibrating team thresholds.',
          createdAt: oneHourAgo,
        },
      ],
      assignedToUserId: 'usr-arjun',
      createdByUserId: 'usr-elena',
    }),
    hydrateRecordDefaults({
      id: 'det-baseline-human',
      createdAt: twoHoursAgo,
      sourceType: 'document',
      title: 'Spectrometer_Field_Notes.txt (Baseline Reference)',
      fileName: 'Spectrometer_Field_Notes.txt',
      mimeType: 'text/plain',
      wordCount: humanMetrics.wordCount,
      characterCount: humanMetrics.characterCount,
      contentPreview: sampleHumanText.slice(0, 160),
      fullText: sampleHumanText,
      aiProbability: 7.4,
      humanProbability: 92.6,
      confidence: 94,
      verdict: 'Human',
      suspectedModelFamily: 'Human Authored',
      detectedLanguage: 'English',
      languageConfidence: 95,
      summary:
        'High sentence-length burstiness, specific physical troubleshooting details, and natural informal ellipsis. No synthetic discourse patterns observed.',
      sentences: humanSentences,
      readability: humanMetrics.readability,
      writingQuality: humanMetrics.writingQuality,
      plagiarism: { overallSimilarityPercent: 0, matches: [] },
      pluginFindings: [],
      humanizedVersions: [],
      comments: [],
      createdByUserId: 'usr-arjun',
    }),
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      timestamp: twoHoursAgo,
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'WORKSPACE_INITIALIZED',
      target: 'Veritas Content Intelligence Node',
      detail: 'Initialized open-source workspace with 4 active detection plugins, citation vault, and local storage.',
    },
  ];

  const baselineAuthorSample = sampleHumanText;
  const baselineVec = computeAuthorVector(baselineAuthorSample);
  const authorProfiles: AuthorStylometricProfile[] = [
    {
      id: 'prof-arjun',
      authorName: 'Arjun Mehta',
      departmentOrRole: 'Forensic Engineering',
      sampleCount: 1,
      totalWordsProfiled: baselineVec.wordCount,
      vector: baselineVec.vector,
      updatedAt: twoHoursAgo,
    },
  ];

  const privacyConfig: PrivacyRuntimeConfig = {
    mode: 'hybrid-airlock',
    scrubPiiBeforeExternal: true,
    storeRawText: true,
  };

  return {
    history,
    jobs: [],
    apiKeys,
    plugins,
    users,
    auditLogs,
    citations,
    codeReports: [],
    authorProfiles,
    proofs: [],
    privacyConfig,
    signingKeys: generateEd25519Keypair(),
  };
}

class VeritasStore {
  private data: StoreData;
  private rateLimitWindows = new Map<string, number[]>();

  constructor() {
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<StoreData>;
        const fresh = createInitialStore();
        return {
          history: (parsed.history || fresh.history).map(hydrateRecordDefaults),
          jobs: parsed.jobs || [],
          apiKeys: parsed.apiKeys || fresh.apiKeys,
          plugins: parsed.plugins || fresh.plugins,
          users: parsed.users || fresh.users,
          auditLogs: parsed.auditLogs || fresh.auditLogs,
          citations: parsed.citations || fresh.citations,
          codeReports: parsed.codeReports || [],
          authorProfiles: parsed.authorProfiles || fresh.authorProfiles,
          proofs: parsed.proofs || [],
          privacyConfig: parsed.privacyConfig || fresh.privacyConfig,
          signingKeys: parsed.signingKeys || fresh.signingKeys,
        };
      }
    } catch (err) {
      console.error('Failed to read store file, initializing fresh store:', err);
    }
    const fresh = createInitialStore();
    this.save(fresh);
    return fresh;
  }

  private save(target: StoreData = this.data): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${STORE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(target, null, 2), 'utf8');
      fs.renameSync(tmpPath, STORE_PATH);
    } catch (err) {
      console.error('Failed to persist store:', err);
    }
  }

  getHistory(): DetectionRecord[] {
    return this.data.history;
  }

  getRecord(id: string): DetectionRecord | undefined {
    return this.data.history.find((r) => r.id === id);
  }

  addRecord(record: DetectionRecord): DetectionRecord {
    const hydrated = hydrateRecordDefaults(record);
    this.data.history.unshift(hydrated);
    if (this.data.history.length > 500) {
      this.data.history = this.data.history.slice(0, 500);
    }
    this.save();
    return hydrated;
  }

  updateRecord(id: string, updater: (rec: DetectionRecord) => DetectionRecord): DetectionRecord | undefined {
    const idx = this.data.history.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    this.data.history[idx] = hydrateRecordDefaults(updater(this.data.history[idx]));
    this.save();
    return this.data.history[idx];
  }

  deleteRecord(id: string): boolean {
    const before = this.data.history.length;
    this.data.history = this.data.history.filter((r) => r.id !== id);
    if (this.data.history.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  addComment(recordId: string, comment: CollaborationComment): DetectionRecord | undefined {
    return this.updateRecord(recordId, (rec) => ({
      ...rec,
      comments: [...rec.comments, comment],
    }));
  }

  // Citations
  getCitations(): CitationEntry[] {
    return this.data.citations;
  }

  addCitation(input: Omit<CitationEntry, 'id' | 'createdAt'>): CitationEntry {
    const entry: CitationEntry = {
      ...input,
      id: `cit-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.citations.unshift(entry);
    this.save();
    return entry;
  }

  deleteCitation(id: string): boolean {
    const before = this.data.citations.length;
    this.data.citations = this.data.citations.filter((c) => c.id !== id);
    if (this.data.citations.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  // Jobs
  getJobs(): QueueJob[] {
    return this.data.jobs;
  }

  getJob(id: string): QueueJob | undefined {
    return this.data.jobs.find((j) => j.id === id);
  }

  upsertJob(job: QueueJob): QueueJob {
    const idx = this.data.jobs.findIndex((j) => j.id === job.id);
    if (idx === -1) {
      this.data.jobs.unshift(job);
      if (this.data.jobs.length > 200) {
        this.data.jobs = this.data.jobs.slice(0, 200);
      }
    } else {
      this.data.jobs[idx] = job;
    }
    this.save();
    return job;
  }

  // API Keys & Rate Limiting
  getApiKeys(): ApiKeyRecord[] {
    return this.data.apiKeys;
  }

  getPublicApiKeys(): Omit<ApiKeyRecord, 'keyHash'>[] {
    return this.data.apiKeys.map(({ keyHash: _omitted, ...safe }) => ({
      ...safe,
      role: safe.role || 'Admin',
    }));
  }

  createApiKey(
    name: string,
    rateLimitRpm: number,
    role: UserRole = 'Admin'
  ): { record: Omit<ApiKeyRecord, 'keyHash'>; rawKey: string } {
    const validRole: UserRole =
      role === 'Admin' || role === 'Researcher' || role === 'Reviewer' || role === 'Viewer'
        ? role
        : 'Researcher';
    const rawKey = `vrt_live_${crypto.randomBytes(18).toString('hex')}`;
    const record: ApiKeyRecord = {
      id: `key-${crypto.randomUUID().slice(0, 8)}`,
      name: String(name || 'API Token').trim().slice(0, 100) || 'API Token',
      prefix: rawKey.slice(0, 16),
      keyHash: hashKey(rawKey),
      role: validRole,
      createdAt: new Date().toISOString(),
      rateLimitRpm: Math.max(1, Math.min(10000, Math.round(Number(rateLimitRpm) || 120))),
      requestCount: 0,
      active: true,
    };
    this.data.apiKeys.unshift(record);
    this.save();
    const { keyHash: _omitted, ...publicRecord } = record;
    return { record: publicRecord, rawKey };
  }

  updateApiKey(
    id: string,
    rawPatch: Partial<Pick<ApiKeyRecord, 'active' | 'rateLimitRpm' | 'name'>>
  ): Omit<ApiKeyRecord, 'keyHash'> | undefined {
    const idx = this.data.apiKeys.findIndex((k) => k.id === id);
    if (idx === -1) return undefined;
    const clean = stripPrototypePollutionKeys<Pick<ApiKeyRecord, 'active' | 'rateLimitRpm' | 'name'>>(rawPatch);
    const current = this.data.apiKeys[idx];
    const next: ApiKeyRecord = {
      ...current,
      active: typeof clean.active === 'boolean' ? clean.active : current.active,
      rateLimitRpm:
        typeof clean.rateLimitRpm === 'number' && Number.isFinite(clean.rateLimitRpm)
          ? Math.max(1, Math.min(10000, Math.round(clean.rateLimitRpm)))
          : current.rateLimitRpm,
      name:
        typeof clean.name === 'string' && clean.name.trim()
          ? clean.name.trim().slice(0, 100)
          : current.name,
    };
    this.data.apiKeys[idx] = next;
    this.save();
    const { keyHash: _omitted, ...publicRecord } = next;
    return publicRecord;
  }

  deleteApiKey(id: string): boolean {
    const before = this.data.apiKeys.length;
    this.data.apiKeys = this.data.apiKeys.filter((k) => k.id !== id);
    if (this.data.apiKeys.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  verifyAndTrackApiKey(rawKey: string): {
    allowed: boolean;
    status: number;
    message?: string;
    role?: UserRole;
  } {
    const candidateBuf = Buffer.from(hashKey(rawKey), 'hex');
    const key = this.data.apiKeys.find((k) => {
      try {
        const storedBuf = Buffer.from(k.keyHash, 'hex');
        return storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf);
      } catch {
        return false;
      }
    });
    if (!key) {
      return { allowed: false, status: 401, message: 'Invalid API key.' };
    }
    if (!key.active) {
      return { allowed: false, status: 403, message: 'API key is disabled.' };
    }

    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (this.rateLimitWindows.get(key.id) || []).filter((ts) => ts > windowStart);
    if (timestamps.length >= key.rateLimitRpm) {
      return {
        allowed: false,
        status: 429,
        message: `Rate limit exceeded (${key.rateLimitRpm} req/min).`,
      };
    }
    timestamps.push(now);
    this.rateLimitWindows.set(key.id, timestamps);
    key.requestCount += 1;
    key.lastUsedAt = new Date().toISOString();
    this.save();
    return { allowed: true, status: 200, role: key.role || 'Admin' };
  }

  // Plugins
  getPlugins(): PluginConfig[] {
    return this.data.plugins;
  }

  createPlugin(input: Omit<PluginConfig, 'id' | 'createdAt'>): PluginConfig {
    const allowedCategories: PluginConfig['category'][] = [
      'Stylometry',
      'Forensics',
      'Compliance',
      'Custom Rule',
    ];
    const safeCategory = allowedCategories.includes(input.category)
      ? input.category
      : 'Custom Rule';
    const plugin: PluginConfig = {
      name: String(input.name).trim().slice(0, 120),
      description: String(input.description || 'Custom rule plugin').trim().slice(0, 320),
      category: safeCategory,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
      weight: Math.max(-25, Math.min(25, Math.round(Number(input.weight) || 8))),
      pattern: String(input.pattern).trim().slice(0, 500),
      isRegex: Boolean(input.isRegex),
      id: `plugin-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.plugins.unshift(plugin);
    this.save();
    return plugin;
  }

  updatePlugin(id: string, rawPatch: Partial<PluginConfig>): PluginConfig | undefined {
    const idx = this.data.plugins.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const clean = stripPrototypePollutionKeys<PluginConfig>(rawPatch);
    const current = this.data.plugins[idx];
    const allowedCategories: PluginConfig['category'][] = [
      'Stylometry',
      'Forensics',
      'Compliance',
      'Custom Rule',
    ];
    this.data.plugins[idx] = {
      ...current,
      name:
        typeof clean.name === 'string' && clean.name.trim()
          ? clean.name.trim().slice(0, 120)
          : current.name,
      description:
        typeof clean.description === 'string'
          ? clean.description.trim().slice(0, 320)
          : current.description,
      category:
        clean.category && allowedCategories.includes(clean.category)
          ? clean.category
          : current.category,
      enabled: typeof clean.enabled === 'boolean' ? clean.enabled : current.enabled,
      weight:
        typeof clean.weight === 'number' && Number.isFinite(clean.weight)
          ? Math.max(-25, Math.min(25, Math.round(clean.weight)))
          : current.weight,
      pattern:
        typeof clean.pattern === 'string'
          ? clean.pattern.trim().slice(0, 500)
          : current.pattern,
      isRegex: typeof clean.isRegex === 'boolean' ? clean.isRegex : current.isRegex,
    };
    this.save();
    return this.data.plugins[idx];
  }

  deletePlugin(id: string): boolean {
    const before = this.data.plugins.length;
    this.data.plugins = this.data.plugins.filter((p) => p.id !== id);
    if (this.data.plugins.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  // Users
  getUsers(): TeamUser[] {
    return this.data.users;
  }

  createUser(input: Pick<TeamUser, 'name' | 'email' | 'role'>): TeamUser {
    const validRoles: UserRole[] = ['Admin', 'Researcher', 'Reviewer', 'Viewer'];
    const role: UserRole = validRoles.includes(input.role) ? input.role : 'Reviewer';
    const user: TeamUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      name: String(input.name).trim().slice(0, 100),
      email: String(input.email).trim().toLowerCase().slice(0, 140),
      role,
      active: true,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  updateUser(
    id: string,
    rawPatch: Partial<Pick<TeamUser, 'role' | 'active' | 'name'>>
  ): TeamUser | undefined {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    const clean = stripPrototypePollutionKeys<Pick<TeamUser, 'role' | 'active' | 'name'>>(rawPatch);
    const current = this.data.users[idx];
    const validRoles: UserRole[] = ['Admin', 'Researcher', 'Reviewer', 'Viewer'];
    this.data.users[idx] = {
      ...current,
      role: clean.role && validRoles.includes(clean.role) ? clean.role : current.role,
      active: typeof clean.active === 'boolean' ? clean.active : current.active,
      name:
        typeof clean.name === 'string' && clean.name.trim()
          ? clean.name.trim().slice(0, 100)
          : current.name,
    };
    this.save();
    return this.data.users[idx];
  }

  eraseUserAndPii(userId: string): {
    deleted: boolean;
    scrubbedRecords: number;
    deletedProfiles: number;
  } {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) {
      return { deleted: false, scrubbedRecords: 0, deletedProfiles: 0 };
    }
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    let scrubbedRecords = 0;
    this.data.history = this.data.history.map((rec) => {
      const hasUserComment = rec.comments.some((c) => c.userId === userId);
      if (rec.createdByUserId === userId || rec.assignedToUserId === userId || hasUserComment) {
        scrubbedRecords += 1;
        return {
          ...rec,
          createdByUserId: rec.createdByUserId === userId ? 'erased-subject' : rec.createdByUserId,
          assignedToUserId: rec.assignedToUserId === userId ? undefined : rec.assignedToUserId,
          comments: rec.comments.map((c) =>
            c.userId === userId ? { ...c, userId: 'erased-subject', userName: '[Erased User]' } : c
          ),
        };
      }
      return rec;
    });
    const prevProfiles = this.data.authorProfiles.length;
    this.data.authorProfiles = this.data.authorProfiles.filter(
      (p) => p.authorName.toLowerCase() !== user.name.toLowerCase()
    );
    const deletedProfiles = prevProfiles - this.data.authorProfiles.length;
    this.save();
    return { deleted: true, scrubbedRecords, deletedProfiles };
  }

  // Audit logs
  getAuditLogs(): AuditLogEntry[] {
    return this.data.auditLogs;
  }

  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const full: AuditLogEntry = {
      ...entry,
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.auditLogs.unshift(full);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save();
    return full;
  }

  // Code Reports
  getCodeReports(): CodeAnalysisReport[] {
    return this.data.codeReports.map((e) => e.report);
  }

  getCodeEntries(): { id: string; title: string; normalizedTokens: string[] }[] {
    return this.data.codeReports.map((e) => ({
      id: e.report.id,
      title: e.report.title,
      normalizedTokens: e.normalizedTokens,
    }));
  }

  addCodeReport(report: CodeAnalysisReport, normalizedTokens: string[]): CodeAnalysisReport {
    this.data.codeReports.unshift({ report, normalizedTokens });
    if (this.data.codeReports.length > 200) {
      this.data.codeReports = this.data.codeReports.slice(0, 200);
    }
    this.save();
    return report;
  }

  // Author Stylometric Profiles
  getAuthorProfiles(): AuthorStylometricProfile[] {
    return this.data.authorProfiles;
  }

  getAuthorProfile(id: string): AuthorStylometricProfile | undefined {
    return this.data.authorProfiles.find((p) => p.id === id);
  }

  upsertAuthorProfile(profile: AuthorStylometricProfile): AuthorStylometricProfile {
    const idx = this.data.authorProfiles.findIndex((p) => p.id === profile.id);
    if (idx === -1) {
      this.data.authorProfiles.unshift(profile);
    } else {
      this.data.authorProfiles[idx] = profile;
    }
    this.save();
    return profile;
  }

  deleteAuthorProfile(id: string): boolean {
    const before = this.data.authorProfiles.length;
    this.data.authorProfiles = this.data.authorProfiles.filter((p) => p.id !== id);
    if (this.data.authorProfiles.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  // Cryptographic Proofs & Signing Keys
  getProofs(): VeritasProofBundle[] {
    return this.data.proofs;
  }

  getProof(id: string): VeritasProofBundle | undefined {
    return this.data.proofs.find((p) => p.proofId === id);
  }

  addProof(bundle: VeritasProofBundle): VeritasProofBundle {
    this.data.proofs.unshift(bundle);
    if (this.data.proofs.length > 200) {
      this.data.proofs = this.data.proofs.slice(0, 200);
    }
    this.save();
    return bundle;
  }

  getSigningKeys(): { publicKeyPem: string; privateKeyPem: string } {
    return this.data.signingKeys;
  }

  // Privacy Runtime Config
  getPrivacyConfig(): PrivacyRuntimeConfig {
    return this.data.privacyConfig;
  }

  updatePrivacyConfig(patch: Partial<PrivacyRuntimeConfig>): PrivacyRuntimeConfig {
    this.data.privacyConfig = { ...this.data.privacyConfig, ...patch };
    this.save();
    return this.data.privacyConfig;
  }

  // Analytics
  getAnalytics(): AnalyticsSummary {
    const records = this.data.history;
    const totalScans = records.length;
    const totalWordsAnalyzed = records.reduce((s, r) => s + r.wordCount, 0);
    const avgAiProbability =
      totalScans > 0
        ? Math.round((records.reduce((s, r) => s + r.aiProbability, 0) / totalScans) * 10) / 10
        : 0;
    const avgAuthenticityScore =
      totalScans > 0
        ? Math.round(
            (records.reduce((s, r) => s + (r.authenticity?.overallScore ?? 100 - r.aiProbability), 0) /
              totalScans) *
              10
          ) / 10
        : 0;
    const avgQualityScore =
      totalScans > 0
        ? Math.round(
            (records.reduce((s, r) => s + (r.contentQuality?.overallScore ?? r.writingQuality.overall), 0) /
              totalScans) *
              10
          ) / 10
        : 0;
    const avgSeoScore =
      totalScans > 0
        ? Math.round(
            (records.reduce((s, r) => s + (r.seoAnalysis?.overallScore ?? 65), 0) / totalScans) *
              10
          ) / 10
        : 0;

    let humanCount = 0;
    let mixedCount = 0;
    let aiCount = 0;
    let humanizationCount = 0;
    let reductionSum = 0;

    const bySourceType: Record<SourceType, number> = {
      text: 0,
      document: 0,
      url: 0,
      image: 0,
      audio: 0,
      video: 0,
    };

    const byDay = new Map<string, { scans: number; aiSum: number }>();

    for (const r of records) {
      if (r.verdict === 'Human') humanCount++;
      else if (r.verdict === 'Mixed') mixedCount++;
      else aiCount++;

      bySourceType[r.sourceType] = (bySourceType[r.sourceType] || 0) + 1;

      for (const h of r.humanizedVersions || []) {
        humanizationCount++;
        reductionSum += Math.max(0, h.originalAiScore - h.recheckAiScore);
      }

      const day = r.createdAt.slice(0, 10);
      const bucket = byDay.get(day) || { scans: 0, aiSum: 0 };
      bucket.scans += 1;
      bucket.aiSum += r.aiProbability;
      byDay.set(day, bucket);
    }

    const recentTrend = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, v]) => ({
        date,
        scans: v.scans,
        avgAiScore: Math.round((v.aiSum / v.scans) * 10) / 10,
      }));

    return {
      totalScans,
      totalWordsAnalyzed,
      avgAiProbability,
      avgAuthenticityScore,
      avgQualityScore,
      avgSeoScore,
      humanCount,
      mixedCount,
      aiCount,
      humanizationCount,
      avgHumanizationReduction:
        humanizationCount > 0 ? Math.round((reductionSum / humanizationCount) * 10) / 10 : 0,
      bySourceType,
      recentTrend,
    };
  }
}

export const store = new VeritasStore();
