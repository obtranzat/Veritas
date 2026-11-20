export type DetectionVerdict = 'Human' | 'Mixed' | 'AI-Generated';
export type SourceType = 'text' | 'document' | 'url' | 'image' | 'audio' | 'video';
export type HumanizationIntensity = 'light' | 'moderate' | 'aggressive';
export type UserRole = 'Admin' | 'Researcher' | 'Reviewer' | 'Viewer';
export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'IEEE' | 'BibTeX';

export interface SentenceAnalysis {
  id: number;
  text: string;
  start: number;
  end: number;
  aiProbability: number; // 0..100
  label: 'Human' | 'Uncertain' | 'AI';
  reason: string;
  perplexityProxy: number;
  wordCount: number;
}

export interface ReadabilityMetrics {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  gunningFog: number;
  smogIndex: number;
  colemanLiauIndex: number;
  automatedReadabilityIndex: number;
  targetAudience: string;
  avgSentenceLength: number;
  avgSyllablesPerWord: number;
  passiveVoicePercent: number;
  readingTimeMinutes: number;
  sentenceDistribution: {
    short: number; // <= 10 words
    medium: number; // 11..20 words
    long: number; // 21..30 words
    veryLong: number; // > 30 words
  };
}

export interface WritingQualityMetrics {
  overall: number; // 0..100
  clarity: number;
  conciseness: number;
  lexicalRichness: number;
  structuralVariety: number;
  burstiness: number;
  typeTokenRatio: number;
  hapaxRatio: number;
}

export interface ContentQualityReport {
  overallScore: number; // 0..100
  depthAndSpecificity: number;
  evidenceDensity: number;
  coherenceAndFlow: number;
  toneConsistency: number;
  argumentStrength: number;
  detectedTone: string;
  fillerPhraseCount: number;
  strengths: string[];
  recommendations: string[];
}

export interface FactCheckClaim {
  id: string;
  claim: string;
  status: 'Verified' | 'Disputed' | 'Unverified' | 'Needs Context';
  confidence: number;
  explanation: string;
  sources: {
    title: string;
    url: string;
    domain: string;
    credibilityTier: 'Academic / Gov' | 'Primary / Reference' | 'News / Editorial' | 'General Web';
  }[];
}

export interface FactCheckReport {
  checkedAt: string;
  overallVeracityScore: number; // 0..100
  verifiedCount: number;
  disputedCount: number;
  unverifiedCount: number;
  summary: string;
  claims: FactCheckClaim[];
  groundingSources: {
    title: string;
    url: string;
    domain: string;
    credibilityTier: 'Academic / Gov' | 'Primary / Reference' | 'News / Editorial' | 'General Web';
  }[];
}

export interface SeoKeywordMetric {
  keyword: string;
  count: number;
  densityPercent: number;
}

export interface SeoAnalysisReport {
  overallScore: number; // 0..100
  targetKeyword?: string;
  targetKeywordCount?: number;
  targetKeywordDensity?: number;
  searchIntent: 'Informational' | 'Commercial' | 'Transactional' | 'Navigational';
  suggestedTitle: string;
  suggestedMetaDescription: string;
  headingCount: number;
  avgParagraphWords: number;
  transitionWordRatio: number;
  topKeywords: SeoKeywordMetric[];
  checklist: {
    label: string;
    passed: boolean;
    detail: string;
  }[];
}

export interface AcademicIntegrityReport {
  integrityScore: number; // 0..100 (higher = stronger academic integrity)
  riskLevel: 'Low Risk' | 'Moderate Risk' | 'High Risk';
  aiAssistanceRisk: number; // 0..100
  citationCoverageScore: number; // 0..100
  paraphraseIntegrityScore: number; // 0..100
  inlineCitationCount: number;
  uncitedClaimCount: number;
  academicRegisterScore: number; // 0..100
  findings: string[];
  recommendations: string[];
}

export interface ContentAuthenticityReport {
  overallScore: number; // 0..100
  grade: 'Verified Authentic' | 'Mostly Authentic' | 'Mixed Provenance' | 'Synthetic / Unverified';
  humanSignalWeight: number;
  originalityWeight: number;
  factualityWeight: number;
  provenanceWeight: number;
  rationale: string;
}

export interface CitationEntry {
  id: string;
  title: string;
  authors: string[];
  year: string;
  publisherOrJournal: string;
  url?: string;
  doi?: string;
  sourceType: 'Journal Article' | 'Web Page' | 'Book' | 'Report' | 'Dataset';
  verificationStatus: 'Verified Source' | 'Needs Review' | 'Unresolved';
  createdAt: string;
  linkedRecordId?: string;
  tags: string[];
}

export interface PlagiarismReport {
  overallSimilarityPercent: number;
  matches: {
    sourceId: string;
    sourceTitle: string;
    similarityPercent: number;
    matchedExcerpts: string[];
  }[];
  webMatches?: {
    url: string;
    title: string;
    matchedExcerpt: string;
    similarityNote: string;
  }[];
  webCheckedAt?: string;
}

export interface PluginFinding {
  pluginId: string;
  pluginName: string;
  triggered: boolean;
  scoreDelta: number;
  findings: string[];
}

export interface DeepfakeIndicator {
  category: string;
  severity: 'Low' | 'Medium' | 'High';
  detail: string;
}

export interface MediaForensics {
  mediaType: 'image' | 'audio' | 'video';
  format: string;
  fileSizeBytes: number;
  dimensions?: { width: number; height: number };
  metadataTags: Record<string, string>;
  generativeSignatures: string[];
  deepfakeIndicators: DeepfakeIndicator[];
  ocrText?: string;
  transcript?: string;
  audioSyncAssessment?: string;
  frameConsistencyScore?: number;
  byteEntropy: number;
  syntheticProbability: number; // 0..100
}

export interface HumanizedRevision {
  id: string;
  createdAt: string;
  intensity: HumanizationIntensity;
  originalText: string;
  humanizedText: string;
  originalAiScore: number;
  recheckAiScore: number;
  recheckVerdict: DetectionVerdict;
  preservedFactsNotes: string[];
  changesSummary: string;
}

export interface CollaborationComment {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  text: string;
  createdAt: string;
}

export interface DetectionRecord {
  id: string;
  createdAt: string;
  sourceType: SourceType;
  title: string;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  wordCount: number;
  characterCount: number;
  contentPreview: string;
  fullText: string;
  aiProbability: number; // 0..100
  humanProbability: number; // 0..100
  confidence: number; // 0..100
  verdict: DetectionVerdict;
  suspectedModelFamily: string;
  detectedLanguage: string;
  languageConfidence: number;
  summary: string;
  sentences: SentenceAnalysis[];
  readability: ReadabilityMetrics;
  writingQuality: WritingQualityMetrics;
  contentQuality?: ContentQualityReport;
  seoAnalysis?: SeoAnalysisReport;
  academicIntegrity?: AcademicIntegrityReport;
  authenticity?: ContentAuthenticityReport;
  factCheck?: FactCheckReport;
  extractedCitations?: string[];
  plagiarism: PlagiarismReport;
  pluginFindings: PluginFinding[];
  mediaForensics?: MediaForensics;
  adversarialSecurity?: AdversarialSecurityReport;
  paraphraseSpin?: ParaphraseSpinReport;
  geoAnalysis?: GeoAnalysisReport;
  crossLingualMatches?: CrossLingualMatch[];
  humanizedVersions: HumanizedRevision[];
  comments: CollaborationComment[];
  assignedToUserId?: string;
  createdByUserId: string;
}

export interface AdversarialSecurityReport {
  evasionDetected: boolean;
  zeroWidthCount: number;
  homoglyphCount: number;
  bidiControlCount: number;
  promptInjectionFlags: string[];
  hiddenTextFlags: string[];
  normalizedDiffSummary: string;
  piiDetectedCount: number;
}

export interface ParaphraseSpinReport {
  spinProbability: number; // 0..100
  classification: 'Authentic Prose' | 'Lightly Edited' | 'AI-Paraphrased / Spun';
  aiVocabularyHits: string[];
  indicators: string[];
}

export interface ExclusionFilters {
  excludeQuotes: boolean;
  excludeBibliography: boolean;
  excludeHeaders: boolean;
  minMatchWords: number;
}

export interface FilteredScoreResult {
  filters: ExclusionFilters;
  adjustedAiProbability: number;
  adjustedPlagiarismPercent: number;
  excludedWordCount: number;
  remainingWordCount: number;
  note: string;
}

export interface GeoAnalysisReport {
  geoScore: number; // 0..100
  entityDensityScore: number;
  directAnswerReadiness: number;
  schemaReadiness: number;
  citationWorthinessScore: number;
  detectedEntities: string[];
  recommendations: string[];
}

export interface CrossLingualMatch {
  sourceUrl: string;
  sourceTitle: string;
  sourceLanguage: string;
  matchedOriginalExcerpt: string;
  translatedMatchExcerpt: string;
  similarityNote: string;
}

export interface CitationEntailmentResult {
  claim: string;
  citationUrl: string;
  status: 'Supported' | 'Partially Supported' | 'Contradicted' | 'Not Found in Source';
  confidence: number;
  rationale: string;
  matchedEvidenceQuote: string;
  sourceTitle: string;
}

export interface CodeAnalysisReport {
  id: string;
  createdAt: string;
  title: string;
  language: string;
  lineCount: number;
  aiCodeProbability: number;
  verdict: DetectionVerdict;
  confidence: number;
  suspectedAssistant: string;
  astFingerprint: string;
  cyclomaticComplexity: number;
  codeOverlapMatches: {
    sourceId: string;
    sourceTitle: string;
    structuralSimilarityPercent: number;
  }[];
  spdxLicenseRisks: {
    licenseId: string;
    severity: 'Info' | 'Warning' | 'High';
    detail: string;
  }[];
  llmIdiomFindings: string[];
  securityNotes: string[];
  summary: string;
}

export interface AuthorStylometricVector {
  avgSentenceLength: number;
  burstiness: number;
  typeTokenRatio: number;
  hapaxRatio: number;
  avgWordLength: number;
  punctuationPer100Words: number;
  contractionRate: number;
  functionWordRatios: number[];
}

export interface AuthorStylometricProfile {
  id: string;
  authorName: string;
  departmentOrRole: string;
  sampleCount: number;
  totalWordsProfiled: number;
  vector: AuthorStylometricVector;
  updatedAt: string;
}

export interface AuthorDriftVerification {
  profileId: string;
  authorName: string;
  driftScore: number; // 0..100 (higher = greater deviation from baseline)
  matchVerdict: 'Consistent Authorship' | 'Moderate Stylistic Shift' | 'Significant Authorship Drift';
  cosineSimilarity: number;
  divergingDimensions: string[];
}

export interface VeritasProofBundle {
  proofId: string;
  version: '1.0';
  documentTitle: string;
  authorLabel: string;
  contentSha256: string;
  createdAt: string;
  ed25519PublicKey: string;
  signature: string;
  processMetrics: {
    durationSeconds: number;
    keystrokeEvents: number;
    pasteEvents: number;
    pasteRatioPercent: number;
    editBurstCount: number;
    revisionEntropy: number;
    merkleRoot: string;
    chunkHashes: string[];
  };
  verified?: boolean;
}

export interface PrivacyRuntimeConfig {
  mode: 'hybrid-airlock' | 'local-only';
  scrubPiiBeforeExternal: boolean;
  storeRawText: boolean;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface QueueJobItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  status: JobStatus;
  progress: number;
  recordId?: string;
  error?: string;
}

export interface QueueJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: 'batch-files' | 'url-crawl' | 'media';
  label: string;
  status: JobStatus;
  concurrency: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  items: QueueJobItem[];
  resultRecordIds: string[];
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;
  role?: UserRole;
  createdAt: string;
  lastUsedAt?: string;
  rateLimitRpm: number;
  requestCount: number;
  active: boolean;
}

export interface PluginConfig {
  id: string;
  name: string;
  description: string;
  category: 'Stylometry' | 'Forensics' | 'Compliance' | 'Custom Rule';
  enabled: boolean;
  weight: number; // -25..+25 score delta
  pattern: string; // comma-separated phrases or regex
  isRegex: boolean;
  createdAt: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  active: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail: string;
}

export interface AnalyticsSummary {
  totalScans: number;
  totalWordsAnalyzed: number;
  avgAiProbability: number;
  avgAuthenticityScore: number;
  avgQualityScore: number;
  avgSeoScore: number;
  humanCount: number;
  mixedCount: number;
  aiCount: number;
  humanizationCount: number;
  avgHumanizationReduction: number;
  bySourceType: Record<SourceType, number>;
  recentTrend: {
    date: string;
    scans: number;
    avgAiScore: number;
  }[];
}
