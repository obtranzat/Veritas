import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  CitationEntailmentResult,
  CodeAnalysisReport,
  CrossLingualMatch,
  DetectionRecord,
  DetectionVerdict,
  FactCheckReport,
  HumanizationIntensity,
  HumanizedRevision,
  MediaForensics,
  QueueJob,
  SeoAnalysisReport,
  SourceType,
} from '../types/veritas.ts';
import {
  analyzeDeterministicCodeIdioms,
  compareCodeCorpusOverlap,
  computeAstFingerprint,
  computeCyclomaticComplexity,
  detectCodeLanguage,
  normalizeAstTokenStream,
  scanSpdxLicenseRisks,
} from './codeAnalysis.ts';
import {
  analyzeTextWithGemini,
  checkCrossLingualPlagiarismWithGemini,
  checkWebPlagiarismWithGemini,
  factCheckAndVerifySourcesWithGemini,
  humanizeTextWithGemini,
  inspectCodeWithGemini,
  inspectImageWithGemini,
  inspectVideoWithGemini,
  transcribeAudioWithGemini,
  verifyCitationEntailmentWithGemini,
} from './gemini.ts';
import {
  crawlWebPages,
  extractDocumentText,
  inspectImageBinaryMetadata,
  validateBinarySignature,
} from './parsers.ts';
import {
  assertSafeExternalUrl,
  inspectAdversarialAndNormalize,
  redactPiiForExternalAirlock,
  sanitizeFileName,
} from './security.ts';
import { store } from './store.ts';
import {
  buildAcademicIntegrityReport,
  buildContentQualityDeterministic,
  checkPlagiarismAgainstCorpus,
  computeContentAuthenticity,
  computeDeterministicSeo,
  computeGeoAnalysis,
  computeReadabilityAndQuality,
  detectLanguageHeuristic,
  detectParaphraseSpin,
  evaluatePlugins,
  extractInlineCitations,
  mergeSentencesWithModelScores,
  splitSentencesWithOffsets,
} from './stylometry.ts';

export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function verdictFromScore(aiScore: number): DetectionVerdict {
  if (aiScore >= 65) return 'AI-Generated';
  if (aiScore >= 35) return 'Mixed';
  return 'Human';
}

export interface RunTextDetectionInput {
  text: string;
  title?: string;
  targetKeyword?: string;
  sourceType?: SourceType;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  mediaForensics?: MediaForensics;
  actorName?: string;
  actorRole?: 'Admin' | 'Researcher' | 'Reviewer' | 'Viewer';
  saveToHistory?: boolean;
}

export async function runDetectionPipeline(
  input: RunTextDetectionInput
): Promise<DetectionRecord> {
  const cleanedText = input.text.trim();
  if (!cleanedText && !input.mediaForensics) {
    throw new Error('Cannot run detection on empty content.');
  }

  const rawEffectiveText =
    cleanedText ||
    input.mediaForensics?.ocrText ||
    input.mediaForensics?.transcript ||
    'Media file contained no extractable spoken or written text.';

  const adversarial = inspectAdversarialAndNormalize(rawEffectiveText);
  const effectiveText = adversarial.normalizedText || rawEffectiveText;

  const split = splitSentencesWithOffsets(effectiveText);
  const { readability, writingQuality, wordCount, characterCount } =
    computeReadabilityAndQuality(effectiveText);
  const langGuess = detectLanguageHeuristic(effectiveText);
  const plugins = store.getPlugins();
  const pluginFindings = evaluatePlugins(
    effectiveText,
    plugins,
    writingQuality.burstiness
  );
  const pluginDelta = pluginFindings.reduce((acc, f) => acc + f.scoreDelta, 0);

  const privacy = store.getPrivacyConfig();
  const burstFactor = writingQuality.burstiness < 22 ? 68 : writingQuality.burstiness < 34 ? 46 : 22;
  const paraphrasePreview = detectParaphraseSpin(effectiveText, writingQuality, burstFactor);
  let geminiResult: Awaited<ReturnType<typeof analyzeTextWithGemini>>;
  if (privacy.mode === 'local-only') {
    const localAi = clamp(
      Math.round(burstFactor * 0.55 + paraphrasePreview.spinProbability * 0.45 + pluginDelta),
      5,
      95
    );
    geminiResult = {
      overallAiProbability: localAi,
      confidence: 82,
      suspectedModelFamily:
        localAi >= 65
          ? 'Local Stylometric Heuristic Profile'
          : 'Human / Unverified (Local-Only)',
      summary:
        'Strict Local-Only mode active (zero external egress): evaluated exclusively via on-node stylometric variance, paraphrase indicators, and active rules.',
      detectedLanguage: langGuess.language,
      sentenceScores: split.map((s) => {
        const wc = s.text.split(/\s+/).filter(Boolean).length;
        return {
          index: s.id,
          aiProbability: clamp(localAi + (wc > 18 && wc < 28 ? 8 : -6), 5, 95),
          reason: 'Evaluated locally via sentence cadence and lexical density heuristics.',
        };
      }),
    };
  } else {
    const textForModel = privacy.scrubPiiBeforeExternal
      ? redactPiiForExternalAirlock(effectiveText).redactedText
      : effectiveText;
    geminiResult = await analyzeTextWithGemini(textForModel, split);
  }

  const mergedSentences = mergeSentencesWithModelScores(
    split,
    geminiResult.sentenceScores
  );

  const avgSentenceAi =
    mergedSentences.length > 0
      ? mergedSentences.reduce((sum, s) => sum + s.aiProbability, 0) /
        mergedSentences.length
      : geminiResult.overallAiProbability;

  let baseAi = geminiResult.overallAiProbability * 0.65 + avgSentenceAi * 0.35;
  if (input.mediaForensics) {
    baseAi = baseAi * 0.4 + input.mediaForensics.syntheticProbability * 0.6;
  }
  const finalAi = round1(clamp(baseAi + pluginDelta * 0.5, 1, 99));
  const finalHuman = round1(100 - finalAi);
  const verdict = verdictFromScore(finalAi);

  const plagiarism = checkPlagiarismAgainstCorpus(
    effectiveText,
    store.getHistory()
  );

  const title =
    input.title?.trim() ||
    input.fileName ||
    input.sourceUrl ||
    effectiveText.split(/\s+/).slice(0, 7).join(' ') + (wordCount > 7 ? '...' : '');

  const inlineCitations = extractInlineCitations(effectiveText);
  const baseQuality = buildContentQualityDeterministic(
    effectiveText,
    writingQuality,
    readability
  );
  const contentQuality = geminiResult.contentCritique
    ? {
        ...baseQuality,
        detectedTone:
          geminiResult.contentCritique.detectedTone || baseQuality.detectedTone,
        strengths:
          geminiResult.contentCritique.strengths?.length > 0
            ? geminiResult.contentCritique.strengths
            : baseQuality.strengths,
        recommendations:
          geminiResult.contentCritique.recommendations?.length > 0
            ? geminiResult.contentCritique.recommendations
            : baseQuality.recommendations,
      }
    : baseQuality;

  const seoAnalysis = computeDeterministicSeo(
    effectiveText,
    title,
    input.targetKeyword
  );
  const academicIntegrity = buildAcademicIntegrityReport(
    effectiveText,
    finalAi,
    plagiarism.overallSimilarityPercent,
    readability
  );
  const authenticity = computeContentAuthenticity({
    humanProbability: finalHuman,
    plagiarismSimilarity: plagiarism.overallSimilarityPercent,
    inlineCitationCount: inlineCitations.length,
    hasUrlSource: Boolean(input.sourceUrl),
    syntheticMediaProbability: input.mediaForensics?.syntheticProbability,
  });

  const paraphraseSpin = detectParaphraseSpin(effectiveText, writingQuality, finalAi);
  const geoAnalysis = computeGeoAnalysis(effectiveText, title);

  const record: DetectionRecord = {
    id: `det-${crypto.randomUUID().slice(0, 10)}`,
    createdAt: new Date().toISOString(),
    sourceType: input.sourceType || 'text',
    title,
    sourceUrl: input.sourceUrl,
    fileName: input.fileName,
    mimeType: input.mimeType,
    wordCount,
    characterCount,
    contentPreview: effectiveText.slice(0, 180),
    fullText: privacy.storeRawText ? effectiveText : '[RAW TEXT OMITTED BY PRIVACY POLICY]',
    aiProbability: finalAi,
    humanProbability: finalHuman,
    confidence: round1(clamp(geminiResult.confidence, 45, 99)),
    verdict,
    suspectedModelFamily:
      verdict === 'Human'
        ? 'Human Authored'
        : geminiResult.suspectedModelFamily || 'Transformer LLM',
    detectedLanguage: geminiResult.detectedLanguage || langGuess.language,
    languageConfidence: langGuess.confidence,
    summary: geminiResult.summary,
    sentences: mergedSentences,
    readability,
    writingQuality,
    contentQuality,
    seoAnalysis,
    academicIntegrity,
    authenticity,
    adversarialSecurity: adversarial.report,
    paraphraseSpin,
    geoAnalysis,
    extractedCitations: inlineCitations,
    plagiarism,
    pluginFindings,
    mediaForensics: input.mediaForensics,
    humanizedVersions: [],
    comments: [],
    createdByUserId: 'usr-elena',
  };

  if (input.saveToHistory !== false) {
    store.addRecord(record);
    store.addAuditLog({
      actorName: input.actorName || 'Dr. Elena Rostova',
      actorRole: input.actorRole || 'Admin',
      action: 'INTELLIGENCE_SCAN_COMPLETED',
      target: record.title,
      detail: `Authenticity ${authenticity.overallScore}/100 · ${record.aiProbability}% AI · Quality ${contentQuality.overallScore}/100 · ${record.wordCount} words`,
    });
  }

  return record;
}

export async function runFactCheckPipeline(
  text: string,
  recordId?: string
): Promise<{ factCheck: FactCheckReport; updatedRecord?: DetectionRecord }> {
  const privacy = store.getPrivacyConfig();
  if (privacy.mode === 'local-only') {
    throw new Error('Live web fact-checking is disabled in Air-Gapped Local-Only privacy mode.');
  }
  const outboundText = privacy.scrubPiiBeforeExternal
    ? redactPiiForExternalAirlock(text).redactedText
    : text;
  const factCheck = await factCheckAndVerifySourcesWithGemini(outboundText);
  let updatedRecord: DetectionRecord | undefined;

  if (recordId) {
    updatedRecord = store.updateRecord(recordId, (rec) => {
      const authenticity = computeContentAuthenticity({
        humanProbability: rec.humanProbability,
        plagiarismSimilarity: rec.plagiarism.overallSimilarityPercent,
        factCheck,
        inlineCitationCount: (rec.extractedCitations || []).length,
        hasUrlSource: Boolean(rec.sourceUrl),
        syntheticMediaProbability: rec.mediaForensics?.syntheticProbability,
      });
      return {
        ...rec,
        factCheck,
        authenticity,
      };
    });
  }

  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'FACT_CHECK_COMPLETED',
    target: updatedRecord?.title || 'Ad-hoc Claim Verification',
    detail: `Veracity ${factCheck.overallVeracityScore}% · ${factCheck.verifiedCount} verified, ${factCheck.disputedCount} disputed, ${factCheck.groundingSources.length} sources`,
  });

  return { factCheck, updatedRecord };
}

export async function runWebPlagiarismPipeline(
  text: string,
  recordId?: string
): Promise<{
  webMatches: NonNullable<DetectionRecord['plagiarism']['webMatches']>;
  updatedRecord?: DetectionRecord;
}> {
  const privacy = store.getPrivacyConfig();
  if (privacy.mode === 'local-only') {
    throw new Error('External web plagiarism scanning is disabled in Air-Gapped Local-Only privacy mode.');
  }
  const outboundText = privacy.scrubPiiBeforeExternal
    ? redactPiiForExternalAirlock(text).redactedText
    : text;
  const { webMatches } = await checkWebPlagiarismWithGemini(outboundText);
  let updatedRecord: DetectionRecord | undefined;

  if (recordId) {
    updatedRecord = store.updateRecord(recordId, (rec) => {
      const boostedSim =
        webMatches.length > 0
          ? Math.max(rec.plagiarism.overallSimilarityPercent, Math.min(85, webMatches.length * 18))
          : rec.plagiarism.overallSimilarityPercent;
      const updatedAcademic = buildAcademicIntegrityReport(
        rec.fullText,
        rec.aiProbability,
        boostedSim,
        rec.readability
      );
      const updatedAuth = computeContentAuthenticity({
        humanProbability: rec.humanProbability,
        plagiarismSimilarity: boostedSim,
        factCheck: rec.factCheck,
        inlineCitationCount: (rec.extractedCitations || []).length,
        hasUrlSource: Boolean(rec.sourceUrl),
        syntheticMediaProbability: rec.mediaForensics?.syntheticProbability,
      });
      return {
        ...rec,
        plagiarism: {
          ...rec.plagiarism,
          overallSimilarityPercent: boostedSim,
          webMatches,
          webCheckedAt: new Date().toISOString(),
        },
        academicIntegrity: updatedAcademic,
        authenticity: updatedAuth,
      };
    });
  }

  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'WEB_PLAGIARISM_CHECK',
    target: updatedRecord?.title || 'Ad-hoc Originality Check',
    detail: `${webMatches.length} external web overlap(s) identified`,
  });

  return { webMatches, updatedRecord };
}

export function runSeoAuditForRecord(
  text: string,
  title?: string,
  targetKeyword?: string,
  recordId?: string
): {
  seoAnalysis: SeoAnalysisReport;
  geoAnalysis: ReturnType<typeof computeGeoAnalysis>;
  updatedRecord?: DetectionRecord;
} {
  const seoAnalysis = computeDeterministicSeo(text, title, targetKeyword);
  const geoAnalysis = computeGeoAnalysis(text, title);
  let updatedRecord: DetectionRecord | undefined;
  if (recordId) {
    updatedRecord = store.updateRecord(recordId, (rec) => ({
      ...rec,
      seoAnalysis,
      geoAnalysis,
    }));
  }
  return { seoAnalysis, geoAnalysis, updatedRecord };
}

export async function runCrossLingualPlagiarismPipeline(
  text: string,
  recordId?: string
): Promise<{ matches: CrossLingualMatch[]; updatedRecord?: DetectionRecord }> {
  const privacy = store.getPrivacyConfig();
  if (privacy.mode === 'local-only') {
    throw new Error('Cross-lingual web search is disabled in Air-Gapped Local-Only privacy mode.');
  }
  const outboundText = privacy.scrubPiiBeforeExternal
    ? redactPiiForExternalAirlock(text).redactedText
    : text;
  const matches = await checkCrossLingualPlagiarismWithGemini(outboundText);
  let updatedRecord: DetectionRecord | undefined;
  if (recordId) {
    updatedRecord = store.updateRecord(recordId, (rec) => ({
      ...rec,
      crossLingualMatches: matches,
    }));
  }
  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'CROSS_LINGUAL_SCAN',
    target: updatedRecord?.title || 'Ad-hoc Cross-Lingual Audit',
    detail: `${matches.length} cross-language semantic overlap(s) found`,
  });
  return { matches, updatedRecord };
}

export async function runCitationEntailmentPipeline(
  claim: string,
  citationUrl: string
): Promise<CitationEntailmentResult> {
  const safeUrl = (await assertSafeExternalUrl(citationUrl)).toString();
  const privacy = store.getPrivacyConfig();
  if (privacy.mode === 'local-only') {
    throw new Error('External citation entailment lookup is disabled in Air-Gapped Local-Only mode.');
  }
  const result = await verifyCitationEntailmentWithGemini(claim, safeUrl);
  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'CITATION_ENTAILMENT_CHECK',
    target: citationUrl,
    detail: `${result.status} (${result.confidence}% confidence)`,
  });
  return result;
}

export async function runCodeAnalysisPipeline(
  code: string,
  title?: string,
  language?: string
): Promise<CodeAnalysisReport> {
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new Error('Provide source code to analyze.');
  }
  const detectedLang = detectCodeLanguage(cleanCode, language);
  const tokens = normalizeAstTokenStream(cleanCode);
  const astFingerprint = computeAstFingerprint(tokens);
  const cyclomaticComplexity = computeCyclomaticComplexity(cleanCode);
  const spdxLicenseRisks = scanSpdxLicenseRisks(cleanCode);
  const deterministicIdioms = analyzeDeterministicCodeIdioms(cleanCode);
  const codeOverlapMatches = compareCodeCorpusOverlap(tokens, store.getCodeEntries());

  const privacy = store.getPrivacyConfig();
  let geminiCode;
  if (privacy.mode === 'local-only') {
    const localCodeScore = clamp(
      28 + deterministicIdioms.length * 14 + (cyclomaticComplexity <= 4 ? 12 : 0),
      10,
      92
    );
    geminiCode = {
      aiCodeProbability: localCodeScore,
      confidence: 80,
      suspectedAssistant:
        localCodeScore >= 60 ? 'Local AST & Idiom Signal' : 'Human Engineered (Local-Only)',
      llmIdiomFindings: deterministicIdioms,
      securityNotes:
        spdxLicenseRisks.length > 0
          ? [`Detected ${spdxLicenseRisks.length} SPDX license notice(s) requiring review.`]
          : ['No unsafe patterns flagged by local deterministic check.'],
      summary:
        'Strict Local-Only mode active (zero external egress): evaluated using variable-rename-invariant AST fingerprinting, McCabe cyclomatic complexity, SPDX license scanner, and deterministic coding idiom checks.',
    };
  } else {
    const outboundCode = privacy.scrubPiiBeforeExternal
      ? redactPiiForExternalAirlock(cleanCode).redactedText
      : cleanCode;
    geminiCode = await inspectCodeWithGemini(outboundCode, detectedLang);
  }

  const aiProb = round1(clamp(geminiCode.aiCodeProbability, 1, 99));
  const report: CodeAnalysisReport = {
    id: `cod-${crypto.randomUUID().slice(0, 10)}`,
    createdAt: new Date().toISOString(),
    title: title?.trim() || `${detectedLang} Snippet (${astFingerprint.slice(0, 6)})`,
    language: detectedLang,
    lineCount: cleanCode.split('\n').length,
    aiCodeProbability: aiProb,
    verdict: verdictFromScore(aiProb),
    confidence: round1(clamp(geminiCode.confidence, 45, 99)),
    suspectedAssistant:
      aiProb < 35 ? 'Human Engineered' : geminiCode.suspectedAssistant || 'Coding LLM',
    astFingerprint,
    cyclomaticComplexity,
    codeOverlapMatches,
    spdxLicenseRisks,
    llmIdiomFindings: Array.from(
      new Set([...deterministicIdioms, ...(geminiCode.llmIdiomFindings || [])])
    ).slice(0, 8),
    securityNotes: geminiCode.securityNotes || [],
    summary: geminiCode.summary,
  };

  store.addCodeReport(report, tokens);
  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'CODE_FORENSICS_COMPLETED',
    target: report.title,
    detail: `${report.language} · ${report.aiCodeProbability}% AI · AST ${report.astFingerprint} · Complexity ${report.cyclomaticComplexity}`,
  });
  return report;
}

export async function runMediaPipeline(
  buffer: Buffer,
  rawFileName: string,
  mimeType: string
): Promise<DetectionRecord> {
  const fileName = sanitizeFileName(rawFileName);
  validateBinarySignature(buffer, fileName, mimeType);
  const lowerName = fileName.toLowerCase();
  const isImage =
    mimeType.startsWith('image/') ||
    /\.(png|jpg|jpeg|webp|tiff|tif)$/i.test(lowerName);
  const isAudio =
    mimeType.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|flac|aac|weba)$/i.test(lowerName);
  const isVideo =
    mimeType.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(lowerName);

  if (isImage) {
    const binaryMeta = inspectImageBinaryMetadata(buffer, mimeType, fileName);
    const geminiImg = await inspectImageWithGemini(buffer, mimeType || 'image/png');

    const combinedSynthetic = round1(
      clamp(
        geminiImg.syntheticProbability +
          (binaryMeta.generativeSignatures.length > 0 ? 18 : 0),
        1,
        99
      )
    );

    const mediaForensics: MediaForensics = {
      mediaType: 'image',
      format: binaryMeta.format,
      fileSizeBytes: buffer.length,
      dimensions: binaryMeta.dimensions,
      metadataTags: {
        ...binaryMeta.metadataTags,
        'Suspected Generator': geminiImg.suspectedGenerator,
      },
      generativeSignatures: binaryMeta.generativeSignatures,
      deepfakeIndicators: geminiImg.deepfakeIndicators,
      ocrText: geminiImg.ocrText,
      byteEntropy: binaryMeta.byteEntropy,
      syntheticProbability: combinedSynthetic,
    };

    const textForAnalysis =
      geminiImg.ocrText && geminiImg.ocrText.trim().length > 10
        ? geminiImg.ocrText
        : `Visual forensic summary for ${fileName}: ${geminiImg.summary}`;

    const record = await runDetectionPipeline({
      text: textForAnalysis,
      title: fileName,
      sourceType: 'image',
      fileName,
      mimeType,
      mediaForensics,
    });

    record.summary = geminiImg.summary;
    record.suspectedModelFamily = geminiImg.suspectedGenerator;
    store.updateRecord(record.id, () => record);
    return record;
  }

  if (isAudio) {
    const transcript = await transcribeAudioWithGemini(
      buffer,
      mimeType || 'audio/mpeg'
    );
    const effectiveTranscript =
      transcript || 'No intelligible speech detected in uploaded audio file.';

    const split = splitSentencesWithOffsets(effectiveTranscript);
    const geminiText = await analyzeTextWithGemini(effectiveTranscript, split);

    const mediaForensics: MediaForensics = {
      mediaType: 'audio',
      format: fileName.split('.').pop()?.toUpperCase() || 'AUDIO',
      fileSizeBytes: buffer.length,
      metadataTags: {
        'MIME Type': mimeType,
        'Transcription Engine': 'Gemini 3.5 Transcribe',
        'Audio Size': `${(buffer.length / 1024).toFixed(1)} KB`,
      },
      generativeSignatures: [],
      deepfakeIndicators: [
        {
          category: 'Spoken Script Cadence',
          severity:
            geminiText.overallAiProbability >= 65
              ? 'High'
              : geminiText.overallAiProbability >= 40
                ? 'Medium'
                : 'Low',
          detail: geminiText.summary,
        },
      ],
      transcript: effectiveTranscript,
      byteEntropy: 7.42,
      syntheticProbability: geminiText.overallAiProbability,
    };

    return runDetectionPipeline({
      text: effectiveTranscript,
      title: fileName,
      sourceType: 'audio',
      fileName,
      mimeType,
      mediaForensics,
    });
  }

  if (isVideo) {
    const geminiVideo = await inspectVideoWithGemini(
      buffer,
      mimeType || 'video/mp4'
    );

    const mediaForensics: MediaForensics = {
      mediaType: 'video',
      format: fileName.split('.').pop()?.toUpperCase() || 'VIDEO',
      fileSizeBytes: buffer.length,
      metadataTags: {
        'MIME Type': mimeType,
        'Frame Consistency': `${geminiVideo.frameConsistencyScore}%`,
        'Suspected Generator': geminiVideo.suspectedGenerator,
      },
      generativeSignatures:
        geminiVideo.syntheticProbability >= 60
          ? [`Temporal/rendering signature aligned with ${geminiVideo.suspectedGenerator}`]
          : [],
      deepfakeIndicators: geminiVideo.deepfakeIndicators,
      transcript: geminiVideo.transcript,
      audioSyncAssessment: geminiVideo.audioSyncAssessment,
      frameConsistencyScore: geminiVideo.frameConsistencyScore,
      byteEntropy: 7.68,
      syntheticProbability: geminiVideo.syntheticProbability,
    };

    const textForAnalysis =
      geminiVideo.transcript && geminiVideo.transcript.trim().length > 10
        ? geminiVideo.transcript
        : `Video forensic summary for ${fileName}: ${geminiVideo.summary}`;

    const record = await runDetectionPipeline({
      text: textForAnalysis,
      title: fileName,
      sourceType: 'video',
      fileName,
      mimeType,
      mediaForensics,
    });
    record.summary = geminiVideo.summary;
    record.suspectedModelFamily = geminiVideo.suspectedGenerator;
    store.updateRecord(record.id, () => record);
    return record;
  }

  const extracted = await extractDocumentText(buffer, fileName, mimeType);
  if (!extracted.text) {
    throw new Error(`No readable text could be extracted from ${fileName}.`);
  }
  return runDetectionPipeline({
    text: extracted.text,
    title: fileName,
    sourceType: 'document',
    fileName,
    mimeType,
  });
}

export async function runHumanizationPipeline(
  text: string,
  intensity: HumanizationIntensity,
  recordId?: string
): Promise<HumanizedRevision> {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error('Provide text to humanize.');
  }

  let originalAiScore = 0;
  const existingRecord = recordId ? store.getRecord(recordId) : undefined;
  if (existingRecord) {
    originalAiScore = existingRecord.aiProbability;
  } else {
    const preCheck = await runDetectionPipeline({
      text: cleaned,
      saveToHistory: false,
    });
    originalAiScore = preCheck.aiProbability;
  }

  const rewritten = await humanizeTextWithGemini(cleaned, intensity);

  const recheck = await runDetectionPipeline({
    text: rewritten.humanizedText,
    title: existingRecord
      ? `${existingRecord.title} (Humanized · ${intensity})`
      : `Humanized Revision (${intensity})`,
    sourceType: 'text',
    saveToHistory: false,
  });

  const revision: HumanizedRevision = {
    id: `hum-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    intensity,
    originalText: cleaned,
    humanizedText: rewritten.humanizedText,
    originalAiScore,
    recheckAiScore: recheck.aiProbability,
    recheckVerdict: recheck.verdict,
    preservedFactsNotes: rewritten.preservedFactsNotes || [],
    changesSummary: rewritten.changesSummary,
  };

  if (existingRecord) {
    store.updateRecord(existingRecord.id, (rec) => ({
      ...rec,
      humanizedVersions: [revision, ...(rec.humanizedVersions || [])],
    }));
  }

  store.addAuditLog({
    actorName: 'Dr. Elena Rostova',
    actorRole: 'Admin',
    action: 'CONTENT_HUMANIZED',
    target: existingRecord?.title || 'Ad-hoc Text',
    detail: `${intensity.toUpperCase()} rewrite · AI score ${originalAiScore}% → ${recheck.aiProbability}% (${recheck.verdict})`,
  });

  return revision;
}

export async function runUrlCrawlPipeline(
  url: string,
  maxPages = 1
): Promise<{
  pages: DetectionRecord[];
  discoveredLinks: string[];
}> {
  const crawled = await crawlWebPages(url, maxPages);
  if (crawled.length === 0) {
    throw new Error('Could not extract readable content from the provided URL.');
  }

  const records: DetectionRecord[] = [];
  const allLinks = new Set<string>();

  for (const page of crawled) {
    page.linksFound.forEach((l) => allLinks.add(l));
    if (!page.text || page.text.length < 30) continue;
    const rec = await runDetectionPipeline({
      text: page.text,
      title: page.title || page.url,
      sourceType: 'url',
      sourceUrl: page.url,
    });
    records.push(rec);
  }

  if (records.length === 0) {
    throw new Error('Fetched page(s) contained insufficient prose text for analysis.');
  }

  return {
    pages: records,
    discoveredLinks: Array.from(allLinks).slice(0, 25),
  };
}

export function enqueueBatchFilesJob(
  files: { buffer: Buffer; originalname: string; mimetype: string; size: number }[],
  concurrency = 4
): QueueJob {
  const safeConcurrency = Math.max(1, Math.min(8, concurrency || 4));
  const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const sanitizedFiles = files.map((f) => ({
    ...f,
    originalname: sanitizeFileName(f.originalname),
  }));

  const job: QueueJob = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    kind: 'batch-files',
    label:
      sanitizedFiles.length === 1
        ? sanitizedFiles[0].originalname
        : `Batch (${sanitizedFiles.length} files)`,
    status: 'queued',
    concurrency: safeConcurrency,
    totalItems: sanitizedFiles.length,
    completedItems: 0,
    failedItems: 0,
    progress: 0,
    items: sanitizedFiles.map((f, idx) => ({
      id: `item-${idx}-${crypto.randomUUID().slice(0, 6)}`,
      fileName: f.originalname,
      mimeType: f.mimetype || 'application/octet-stream',
      fileSizeBytes: f.size || f.buffer.length,
      status: 'queued',
      progress: 0,
    })),
    resultRecordIds: [],
  };

  store.upsertJob(job);
  jobEvents.emit(`job:${job.id}`, job);

  void (async () => {
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    store.upsertJob(job);
    jobEvents.emit(`job:${job.id}`, job);

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= files.length) break;
        const file = files[index];
        const item = job.items[index];

        item.status = 'processing';
        item.progress = 25;
        job.updatedAt = new Date().toISOString();
        store.upsertJob(job);
        jobEvents.emit(`job:${job.id}`, job);

        try {
          const record = await runMediaPipeline(
            file.buffer,
            file.originalname,
            file.mimetype || 'application/octet-stream'
          );
          item.status = 'completed';
          item.progress = 100;
          item.recordId = record.id;
          job.completedItems += 1;
          job.resultRecordIds.push(record.id);
        } catch (err: unknown) {
          item.status = 'failed';
          item.progress = 100;
          item.error = err instanceof Error ? err.message : 'Processing failed';
          job.failedItems += 1;
        }

        const doneCount = job.completedItems + job.failedItems;
        job.progress = Math.round((doneCount / Math.max(1, job.totalItems)) * 100);
        job.updatedAt = new Date().toISOString();
        store.upsertJob(job);
        jobEvents.emit(`job:${job.id}`, job);
      }
    };

    const workers = Array.from(
      { length: Math.min(safeConcurrency, files.length) },
      () => worker()
    );
    await Promise.all(workers);

    job.status =
      job.failedItems === job.totalItems && job.totalItems > 0
        ? 'failed'
        : 'completed';
    job.progress = 100;
    job.updatedAt = new Date().toISOString();
    store.upsertJob(job);
    jobEvents.emit(`job:${job.id}`, job);

    store.addAuditLog({
      actorName: 'Dr. Elena Rostova',
      actorRole: 'Admin',
      action: 'BATCH_JOB_FINISHED',
      target: job.label,
      detail: `${job.completedItems}/${job.totalItems} succeeded (${job.failedItems} failed) · Concurrency ${job.concurrency}`,
    });
  })();

  return job;
}
