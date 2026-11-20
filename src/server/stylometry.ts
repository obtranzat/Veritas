import type {
  AcademicIntegrityReport,
  AuthorDriftVerification,
  AuthorStylometricVector,
  ContentAuthenticityReport,
  ContentQualityReport,
  DetectionRecord,
  FactCheckReport,
  GeoAnalysisReport,
  ParaphraseSpinReport,
  PlagiarismReport,
  PluginConfig,
  PluginFinding,
  ReadabilityMetrics,
  SentenceAnalysis,
  SeoAnalysisReport,
  SeoKeywordMetric,
  WritingQualityMetrics,
} from '../types/veritas.ts';
import { validateSafeRegexPattern } from './security.ts';

export interface SplitSentence {
  id: number;
  text: string;
  start: number;
  end: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were',
  'have', 'has', 'had', 'not', 'but', 'you', 'your', 'they', 'their', 'what',
  'when', 'where', 'which', 'who', 'will', 'would', 'could', 'should', 'about',
  'into', 'over', 'after', 'before', 'more', 'most', 'such', 'than', 'then',
  'there', 'these', 'those', 'also', 'been', 'being', 'can', 'each', 'only',
  'other', 'some', 'very', 'well', 'while', 'all', 'any', 'both', 'few',
  'how', 'its', 'may', 'might', 'must', 'our', 'out', 'own', 'same', 'too',
  'under', 'use', 'used', 'using', 'via', 'between', 'through', 'during',
]);

export function splitSentencesWithOffsets(text: string): SplitSentence[] {
  const results: SplitSentence[] = [];
  const regex = /[^.!?\n]+(?:[.!?]+|\n|$)/g;
  let match: RegExpExecArray | null;
  let id = 0;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leadingWhitespace = raw.indexOf(trimmed);
    const start = match.index + leadingWhitespace;
    const end = start + trimmed.length;
    results.push({ id: id++, text: trimmed, start, end });
  }

  if (results.length === 0 && text.trim().length > 0) {
    results.push({ id: 0, text: text.trim(), start: 0, end: text.trim().length });
  }
  return results;
}

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;
  const normalized = cleaned
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const matches = normalized.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function tokenizeWords(text: string): string[] {
  return (text.match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).map((w) => w.toLowerCase());
}

export function computeReadabilityAndQuality(text: string): {
  readability: ReadabilityMetrics;
  writingQuality: WritingQualityMetrics;
  wordCount: number;
  characterCount: number;
} {
  const words = tokenizeWords(text);
  const sentences = splitSentencesWithOffsets(text);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const characterCount = text.length;

  let totalSyllables = 0;
  let complexWords = 0;
  let alphaChars = 0;
  for (const w of words) {
    const syl = countSyllables(w);
    totalSyllables += syl;
    if (syl >= 3) complexWords++;
    alphaChars += w.replace(/[^a-z0-9]/gi, '').length;
  }

  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = wordCount > 0 ? totalSyllables / wordCount : 0;
  const complexWordRatio = wordCount > 0 ? complexWords / wordCount : 0;

  const fleschReadingEase =
    wordCount > 0
      ? clamp(206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord, 0, 100)
      : 0;
  const fleschKincaidGrade =
    wordCount > 0
      ? clamp(0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59, 0, 20)
      : 0;
  const gunningFog =
    wordCount > 0
      ? clamp(0.4 * (avgSentenceLength + 100 * complexWordRatio), 0, 22)
      : 0;
  const smogIndex =
    sentenceCount >= 1
      ? clamp(1.043 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291, 0, 22)
      : 0;

  // Coleman-Liau Index & Automated Readability Index (ARI)
  const L = wordCount > 0 ? (alphaChars / wordCount) * 100 : 0;
  const S = wordCount > 0 ? (sentenceCount / wordCount) * 100 : 0;
  const colemanLiauIndex = wordCount > 0 ? clamp(0.0588 * L - 0.296 * S - 15.8, 0, 20) : 0;
  const automatedReadabilityIndex =
    wordCount > 0
      ? clamp(4.71 * (alphaChars / wordCount) + 0.5 * avgSentenceLength - 21.43, 0, 20)
      : 0;

  const targetAudience =
    fleschKincaidGrade >= 15
      ? 'Postgraduate / Specialist'
      : fleschKincaidGrade >= 12
        ? 'University / Professional'
        : fleschKincaidGrade >= 8
          ? 'High School / General Adult'
          : 'Broad General Audience';

  const passiveMatches =
    text.match(
      /\b(am|is|are|was|were|be|been|being)\s+([a-z]+ed|written|spoken|driven|given|taken|seen|known|built|made|found|shown|done|held|sent|kept)\b/gi
    ) || [];
  const passiveVoicePercent = round1(clamp((passiveMatches.length / sentenceCount) * 100, 0, 100));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const uniqueWords = freq.size;
  const typeTokenRatio = wordCount > 0 ? round3(uniqueWords / wordCount) : 0;
  const hapaxCount = Array.from(freq.values()).filter((c) => c === 1).length;
  const hapaxRatio = uniqueWords > 0 ? round3(hapaxCount / uniqueWords) : 0;

  const sentenceLengths = sentences.map((s) => tokenizeWords(s.text).length);
  const sentenceDistribution = {
    short: sentenceLengths.filter((n) => n <= 10).length,
    medium: sentenceLengths.filter((n) => n >= 11 && n <= 20).length,
    long: sentenceLengths.filter((n) => n >= 21 && n <= 30).length,
    veryLong: sentenceLengths.filter((n) => n > 30).length,
  };

  const meanLen =
    sentenceLengths.reduce((acc, n) => acc + n, 0) / Math.max(1, sentenceLengths.length);
  const variance =
    sentenceLengths.reduce((acc, n) => acc + Math.pow(n - meanLen, 2), 0) /
    Math.max(1, sentenceLengths.length);
  const stdDev = Math.sqrt(variance);
  const burstiness = round1(clamp((stdDev / Math.max(1, meanLen)) * 100, 0, 100));

  const structuralVariety = round1(clamp(burstiness * 1.15 + (sentenceCount > 3 ? 12 : 0), 15, 98));
  const lexicalRichness = round1(clamp(typeTokenRatio * 95 + hapaxRatio * 20, 15, 98));
  const clarity = round1(clamp(100 - Math.abs(fleschKincaidGrade - 10) * 4.5 - passiveVoicePercent * 0.25, 25, 98));
  const conciseness = round1(clamp(100 - Math.max(0, avgSentenceLength - 22) * 2.2 - passiveVoicePercent * 0.3, 25, 98));
  const overall = round1((clarity + conciseness + lexicalRichness + structuralVariety) / 4);

  return {
    wordCount,
    characterCount,
    readability: {
      fleschReadingEase: round1(fleschReadingEase),
      fleschKincaidGrade: round1(fleschKincaidGrade),
      gunningFog: round1(gunningFog),
      smogIndex: round1(smogIndex),
      colemanLiauIndex: round1(colemanLiauIndex),
      automatedReadabilityIndex: round1(automatedReadabilityIndex),
      targetAudience,
      avgSentenceLength: round1(avgSentenceLength),
      avgSyllablesPerWord: round2(avgSyllablesPerWord),
      passiveVoicePercent,
      readingTimeMinutes: round1(Math.max(0.1, wordCount / 225)),
      sentenceDistribution,
    },
    writingQuality: {
      overall,
      clarity,
      conciseness,
      lexicalRichness,
      structuralVariety,
      burstiness,
      typeTokenRatio,
      hapaxRatio,
    },
  };
}

export function extractInlineCitations(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'-]+(?:\s+(?:et\s+al\.|(?:&|and)\s+[A-Z][A-Za-z'-]+))?,\s*\d{4}[a-z]?(?:,\s*pp?\.\s*\d+(?:-\d+)?)?\)/g,
    /\[\d+(?:\s*[-,–]\s*\d+)*\]/g,
    /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/g,
    /https?:\/\/[^\s)>"']+/g,
  ];
  for (const rx of patterns) {
    const matches = text.match(rx) || [];
    for (const m of matches) {
      found.add(m.trim());
    }
  }
  return Array.from(found).slice(0, 40);
}

export function computeDeterministicSeo(
  text: string,
  title?: string,
  targetKeyword?: string
): SeoAnalysisReport {
  const words = tokenizeWords(text);
  const wordCount = Math.max(1, words.length);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const avgParagraphWords = round1(wordCount / Math.max(1, paragraphs.length));

  const headingLines = text
    .split('\n')
    .filter((l) => /^#{1,4}\s+\S/.test(l.trim()) || (/^[A-Z][^\n.!?]{3,60}$/.test(l.trim()) && l.trim().split(/\s+/).length <= 8));
  const headingCount = headingLines.length;

  const counts = new Map<string, number>();
  for (const w of words) {
    if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const topKeywords: SeoKeywordMetric[] = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({
      keyword,
      count,
      densityPercent: round2((count / wordCount) * 100),
    }));

  const cleanedTarget = targetKeyword?.trim().toLowerCase();
  let targetKeywordCount: number | undefined;
  let targetKeywordDensity: number | undefined;
  if (cleanedTarget) {
    const escaped = cleanedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`\\b${escaped}\\b`, 'gi');
    targetKeywordCount = (text.match(rx) || []).length;
    targetKeywordDensity = round2((targetKeywordCount / wordCount) * 100);
  }

  const transitionMatches =
    text.match(
      /\b(however|therefore|moreover|furthermore|consequently|meanwhile|for example|for instance|in contrast|as a result|additionally|specifically)\b/gi
    ) || [];
  const sentences = splitSentencesWithOffsets(text);
  const transitionWordRatio = round1(
    clamp((transitionMatches.length / Math.max(1, sentences.length)) * 100, 0, 100)
  );

  const checklist: SeoAnalysisReport['checklist'] = [
    {
      label: 'Substantive Long-Form Depth (≥ 300 words)',
      passed: wordCount >= 300,
      detail: `${wordCount} words detected (300+ recommended for organic topical authority).`,
    },
    {
      label: 'Scannable Paragraph Pacing (≤ 95 words/paragraph)',
      passed: avgParagraphWords <= 95,
      detail: `Averaging ${avgParagraphWords} words per paragraph across ${Math.max(1, paragraphs.length)} block(s).`,
    },
    {
      label: 'Structured Subheadings Present',
      passed: headingCount >= 1,
      detail:
        headingCount >= 1
          ? `${headingCount} section heading(s) detected.`
          : 'No explicit headings detected; add H2/H3 subheadings to improve crawlability.',
    },
    {
      label: 'Natural Keyword Density (0.5% – 2.8%)',
      passed: cleanedTarget
        ? (targetKeywordDensity || 0) >= 0.5 && (targetKeywordDensity || 0) <= 2.8
        : (topKeywords[0]?.densityPercent || 0) <= 3.5,
      detail: cleanedTarget
        ? `Target "${targetKeyword}" appears ${targetKeywordCount} time(s) (${targetKeywordDensity}%).`
        : `Top term "${topKeywords[0]?.keyword || 'n/a'}" density is ${topKeywords[0]?.densityPercent || 0}%.`,
    },
    {
      label: 'Outbound / Supporting Source Links',
      passed: /https?:\/\//i.test(text),
      detail: /https?:\/\//i.test(text)
        ? 'External reference URLs present.'
        : 'Add authoritative outbound citations to strengthen E-E-A-T signals.',
    },
  ];

  const passedCount = checklist.filter((c) => c.passed).length;
  const overallScore = round1(clamp((passedCount / checklist.length) * 80 + (wordCount >= 120 ? 15 : 5), 15, 98));

  const fallbackTitle =
    title?.trim() ||
    text.split(/\n/)[0]?.slice(0, 58).trim() ||
    'Content Optimization Report';
  const suggestedTitle =
    fallbackTitle.length > 60 ? `${fallbackTitle.slice(0, 57)}...` : fallbackTitle;
  const suggestedMetaDescription = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 155);

  const searchIntent: SeoAnalysisReport['searchIntent'] = /\b(buy|price|pricing|discount|order|trial|subscribe)\b/i.test(text)
    ? 'Transactional'
    : /\b(best|top|compare|comparison|vs|review|alternative)\b/i.test(text)
      ? 'Commercial'
      : 'Informational';

  return {
    overallScore,
    targetKeyword: targetKeyword?.trim() || undefined,
    targetKeywordCount,
    targetKeywordDensity,
    searchIntent,
    suggestedTitle,
    suggestedMetaDescription,
    headingCount,
    avgParagraphWords,
    transitionWordRatio,
    topKeywords,
    checklist,
  };
}

export function buildContentQualityDeterministic(
  text: string,
  writingQuality: WritingQualityMetrics,
  readability: ReadabilityMetrics
): ContentQualityReport {
  const fillerMatches =
    text.match(
      /\b(in order to|due to the fact that|at the end of the day|very unique|basically|actually|literally|it goes without saying|delve into|ever-evolving landscape)\b/gi
    ) || [];
  const fillerPhraseCount = fillerMatches.length;

  const hasNumbersOrDates = (text.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length;
  const citations = extractInlineCitations(text);

  const depthAndSpecificity = round1(
    clamp(42 + Math.min(35, hasNumbersOrDates * 5) + Math.min(18, writingQuality.hapaxRatio * 22), 20, 97)
  );
  const evidenceDensity = round1(
    clamp(28 + Math.min(40, citations.length * 14) + Math.min(25, hasNumbersOrDates * 4), 15, 96)
  );
  const coherenceAndFlow = round1(
    clamp((writingQuality.clarity + writingQuality.structuralVariety) / 2, 25, 98)
  );
  const toneConsistency = round1(
    clamp(88 - fillerPhraseCount * 4 - Math.max(0, readability.passiveVoicePercent - 20) * 0.5, 35, 97)
  );
  const argumentStrength = round1(
    clamp((depthAndSpecificity + evidenceDensity + coherenceAndFlow) / 3, 20, 96)
  );

  const overallScore = round1(
    (depthAndSpecificity + evidenceDensity + coherenceAndFlow + toneConsistency + argumentStrength) / 5
  );

  const strengths: string[] = [];
  const recommendations: string[] = [];

  if (writingQuality.burstiness >= 42) {
    strengths.push(`Strong rhythmic variety across sentence lengths (${writingQuality.burstiness}% burstiness).`);
  } else {
    recommendations.push('Vary sentence length and clause structure to avoid monotonous pacing.');
  }
  if (hasNumbersOrDates >= 2 || citations.length >= 1) {
    strengths.push('Contains concrete numerical detail or explicit external attribution.');
  } else {
    recommendations.push('Support key assertions with specific metrics, dates, or named primary sources.');
  }
  if (readability.passiveVoicePercent <= 15) {
    strengths.push(`Direct active voice dominance (${readability.passiveVoicePercent}% passive constructions).`);
  } else {
    recommendations.push(`Reduce passive voice constructions (currently ${readability.passiveVoicePercent}%) for sharper agency.`);
  }
  if (fillerPhraseCount > 0) {
    recommendations.push(`Trim ${fillerPhraseCount} filler or cliché phrase(s) to improve precision.`);
  }

  return {
    overallScore,
    depthAndSpecificity,
    evidenceDensity,
    coherenceAndFlow,
    toneConsistency,
    argumentStrength,
    detectedTone:
      readability.fleschKincaidGrade >= 13
        ? 'Analytical / Academic'
        : writingQuality.burstiness >= 45
          ? 'Editorial / Conversational'
          : 'Expository / Neutral',
    fillerPhraseCount,
    strengths: strengths.length > 0 ? strengths : ['Clear baseline syntactic readability.'],
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Maintain current specificity and editorial balance.'],
  };
}

export function buildAcademicIntegrityReport(
  text: string,
  aiProbability: number,
  plagiarismSimilarity: number,
  readability: ReadabilityMetrics
): AcademicIntegrityReport {
  const inlineCitations = extractInlineCitations(text);
  const sentences = splitSentencesWithOffsets(text);
  const factualCandidateCount = sentences.filter((s) =>
    /\b(\d{4}|\d+%|study|research|found|according|percent|data|report|evidence|shows|demonstrates)\b/i.test(
      s.text
    )
  ).length;
  const uncitedClaimCount = Math.max(0, factualCandidateCount - inlineCitations.length);

  const citationCoverageScore =
    factualCandidateCount === 0
      ? inlineCitations.length > 0
        ? 95
        : 75
      : round1(clamp((inlineCitations.length / factualCandidateCount) * 100, 15, 100));

  const aiAssistanceRisk = round1(aiProbability);
  const paraphraseIntegrityScore = round1(clamp(100 - plagiarismSimilarity * 1.4, 5, 100));
  const academicRegisterScore = round1(
    clamp(
      55 +
        (readability.fleschKincaidGrade >= 11 ? 22 : 8) +
        (inlineCitations.length > 0 ? 15 : 0) -
        (readability.passiveVoicePercent > 35 ? 10 : 0),
      20,
      98
    )
  );

  const integrityScore = round1(
    clamp(
      (100 - aiAssistanceRisk) * 0.45 +
        paraphraseIntegrityScore * 0.35 +
        citationCoverageScore * 0.2,
      1,
      99
    )
  );

  const riskLevel: AcademicIntegrityReport['riskLevel'] =
    integrityScore >= 72
      ? 'Low Risk'
      : integrityScore >= 45
        ? 'Moderate Risk'
        : 'High Risk';

  const findings: string[] = [];
  const recommendations: string[] = [];

  if (aiAssistanceRisk >= 60) {
    findings.push(`Elevated synthetic authorship signal (${aiAssistanceRisk}% AI probability).`);
    recommendations.push('Verify drafting history, revision logs, or oral defense comprehension.');
  } else {
    findings.push(`Low synthetic authorship signal (${aiAssistanceRisk}% AI probability).`);
  }

  if (plagiarismSimilarity >= 15) {
    findings.push(`Significant textual overlap (${plagiarismSimilarity}%) against indexed sources.`);
    recommendations.push('Audit matched passages for direct quotation marks and proper attribution.');
  } else {
    findings.push(`Original phrasing verified (${plagiarismSimilarity}% corpus overlap).`);
  }

  if (uncitedClaimCount > 0) {
    findings.push(`${uncitedClaimCount} empirical/factual statement(s) lack adjacent inline citations.`);
    recommendations.push('Attach DOI, author-year, or numbered citations to empirical claims.');
  }

  return {
    integrityScore,
    riskLevel,
    aiAssistanceRisk,
    citationCoverageScore,
    paraphraseIntegrityScore,
    inlineCitationCount: inlineCitations.length,
    uncitedClaimCount,
    academicRegisterScore,
    findings,
    recommendations,
  };
}

export function computeContentAuthenticity(params: {
  humanProbability: number;
  plagiarismSimilarity: number;
  factCheck?: FactCheckReport;
  inlineCitationCount: number;
  hasUrlSource: boolean;
  syntheticMediaProbability?: number;
}): ContentAuthenticityReport {
  const humanSignalWeight = round1(params.humanProbability);
  const originalityWeight = round1(clamp(100 - params.plagiarismSimilarity * 1.2, 0, 100));
  const factualityWeight = params.factCheck
    ? round1(params.factCheck.overallVeracityScore)
    : 72; // Neutral baseline prior until live web verification runs
  const provenanceWeight = round1(
    clamp(
      55 +
        Math.min(30, params.inlineCitationCount * 10) +
        (params.hasUrlSource ? 12 : 0) -
        (params.syntheticMediaProbability && params.syntheticMediaProbability >= 60 ? 35 : 0),
      10,
      98
    )
  );

  const overallScore = round1(
    clamp(
      humanSignalWeight * 0.4 +
        originalityWeight * 0.25 +
        factualityWeight * 0.2 +
        provenanceWeight * 0.15,
      1,
      99
    )
  );

  const grade: ContentAuthenticityReport['grade'] =
    overallScore >= 78
      ? 'Verified Authentic'
      : overallScore >= 58
        ? 'Mostly Authentic'
        : overallScore >= 38
          ? 'Mixed Provenance'
          : 'Synthetic / Unverified';

  const rationale = `Composite index combining ${humanSignalWeight}% human authorship signal, ${originalityWeight}% textual originality, ${
    params.factCheck ? `${factualityWeight}% live fact-check veracity` : 'unverified baseline factuality'
  }, and ${provenanceWeight}% source provenance.`;

  return {
    overallScore,
    grade,
    humanSignalWeight,
    originalityWeight,
    factualityWeight,
    provenanceWeight,
    rationale,
  };
}

export function detectLanguageHeuristic(text: string): { language: string; confidence: number } {
  const sample = text.slice(0, 4000);
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return { language: 'Japanese', confidence: 97 };
  if (/[\u4e00-\u9fff]/.test(sample)) return { language: 'Chinese', confidence: 97 };
  if (/[\uac00-\ud7af]/.test(sample)) return { language: 'Korean', confidence: 97 };
  if (/[\u0600-\u06ff]/.test(sample)) return { language: 'Arabic', confidence: 96 };
  if (/[\u0400-\u04ff]/.test(sample)) return { language: 'Russian', confidence: 94 };
  if (/[\u0900-\u097f]/.test(sample)) return { language: 'Hindi', confidence: 96 };

  const lower = ` ${sample.toLowerCase()} `;
  const markers: Record<string, string[]> = {
    Spanish: [' el ', ' la ', ' los ', ' las ', ' que ', ' para ', ' con ', ' una ', ' por ', ' está '],
    French: [' le ', ' la ', ' les ', ' des ', ' est ', ' pour ', ' dans ', ' une ', ' avec ', ' que '],
    German: [' der ', ' die ', ' das ', ' und ', ' ist ', ' mit ', ' für ', ' auf ', ' nicht ', ' ein '],
    Portuguese: [' o ', ' os ', ' as ', ' para ', ' com ', ' uma ', ' não ', ' que ', ' por ', ' dos '],
    Italian: [' il ', ' lo ', ' la ', ' gli ', ' che ', ' per ', ' con ', ' una ', ' sono ', ' della '],
    Dutch: [' de ', ' het ', ' een ', ' van ', ' en ', ' in ', ' op ', ' voor ', ' met ', ' niet '],
    English: [' the ', ' and ', ' is ', ' in ', ' to ', ' of ', ' that ', ' with ', ' for ', ' are '],
  };

  let bestLang = 'English';
  let bestScore = 0;
  for (const [lang, tokens] of Object.entries(markers)) {
    let score = 0;
    for (const token of tokens) {
      const occurrences = lower.split(token).length - 1;
      score += occurrences;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  const confidence = bestScore >= 6 ? 95 : bestScore >= 2 ? 84 : 72;
  return { language: bestLang, confidence };
}

const AI_PHRASE_PATTERNS: { pattern: RegExp; weight: number; label: string }[] = [
  { pattern: /\b(delve into|delving into|tapestry|testament to|ever-evolving landscape|paradigm shift)\b/i, weight: 24, label: 'Signature LLM phrasing' },
  { pattern: /\b(in today's fast-paced world|it is important to note|it's worth noting|in conclusion|ultimately|furthermore|moreover|additionally)\b/i, weight: 14, label: 'Formulaic AI discourse transition' },
  { pattern: /\b(plays a crucial role|pivotal role|underscores the importance|comprehensive overview|foster innovation|harness the power)\b/i, weight: 18, label: 'Synthetic emphasis boilerplate' },
  { pattern: /\b(on the other hand|conversely|consequently|nevertheless|subsequently)\b/i, weight: 8, label: 'Uniform transitional cadence' },
  { pattern: /\b(streamline|optimize|leverage|facilitate|robust|seamless|cutting-edge|multifaceted)\b/i, weight: 10, label: 'High-frequency AI corporate lexicon' },
];

export function scoreSentenceHeuristic(sentenceText: string): {
  aiProbability: number;
  perplexityProxy: number;
  reason: string;
  wordCount: number;
} {
  const words = tokenizeWords(sentenceText);
  const wordCount = words.length;
  if (wordCount === 0) {
    return { aiProbability: 0, perplexityProxy: 50, reason: 'Empty segment', wordCount: 0 };
  }

  let score = 22;
  const reasons: string[] = [];

  for (const item of AI_PHRASE_PATTERNS) {
    if (item.pattern.test(sentenceText)) {
      score += item.weight;
      reasons.push(item.label);
    }
  }

  const hasContraction = /\b\w+'(t|s|re|ve|ll|d|m)\b/i.test(sentenceText);
  if (!hasContraction && wordCount >= 14) {
    score += 10;
  } else if (hasContraction) {
    score -= 10;
    reasons.push('Natural contraction usage');
  }

  if (/\b(i remember|my|we walked|yesterday|last week|honestly|weirdly)\b/i.test(sentenceText)) {
    score -= 15;
    reasons.push('Personal experiential framing');
  }

  const uniqueRatio = new Set(words).size / Math.max(1, wordCount);
  const perplexityProxy = round1(clamp(uniqueRatio * 75 + (hasContraction ? 15 : 0) + (wordCount < 10 ? 8 : 0), 10, 99));

  if (wordCount >= 16 && wordCount <= 28 && uniqueRatio > 0.72) {
    score += 9;
  }

  const bounded = round1(clamp(score, 4, 96));
  const reason =
    reasons.length > 0
      ? reasons.slice(0, 2).join('; ')
      : bounded >= 60
        ? 'Uniform syntactic rhythm and predictable token distribution'
        : 'Natural lexical variance and idiomatic structure';

  return { aiProbability: bounded, perplexityProxy, reason, wordCount };
}

export function evaluatePlugins(
  text: string,
  plugins: PluginConfig[],
  burstiness: number
): PluginFinding[] {
  const findings: PluginFinding[] = [];
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const matched: string[] = [];

    if (plugin.id === 'plugin-low-burstiness') {
      if (burstiness < 32 && text.split(/\s+/).length > 40) {
        matched.push(`Low sentence-length variance detected (burstiness ${burstiness}% < 32%)`);
      }
    } else if (plugin.pattern.trim()) {
      if (plugin.isRegex) {
        const validation = validateSafeRegexPattern(plugin.pattern);
        if (validation.valid) {
          try {
            const rx = new RegExp(plugin.pattern, 'gi');
            const hits = text.slice(0, 100_000).match(rx);
            if (hits && hits.length > 0) {
              matched.push(`Matched ${hits.length} occurrence(s): ${Array.from(new Set(hits)).slice(0, 4).join(', ')}`);
            }
          } catch {
            // Ignore malformed regex
          }
        }
      } else {
        const phrases = plugin.pattern
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        const lower = text.toLowerCase();
        for (const phrase of phrases) {
          if (lower.includes(phrase.toLowerCase())) {
            matched.push(`Phrase "${phrase}"`);
          }
        }
      }
    }

    findings.push({
      pluginId: plugin.id,
      pluginName: plugin.name,
      triggered: matched.length > 0,
      scoreDelta: matched.length > 0 ? plugin.weight : 0,
      findings: matched,
    });
  }
  return findings;
}

function buildShingles(text: string, n = 5): Set<string> {
  const words = tokenizeWords(text);
  const shingles = new Set<string>();
  if (words.length < n) {
    if (words.length > 0) shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - n; i++) {
    shingles.add(words.slice(i, i + n).join(' '));
  }
  return shingles;
}

export function checkPlagiarismAgainstCorpus(
  text: string,
  corpus: DetectionRecord[],
  excludeRecordId?: string
): PlagiarismReport {
  const targetShingles = buildShingles(text, 5);
  if (targetShingles.size === 0) {
    return { overallSimilarityPercent: 0, matches: [] };
  }

  const matches: PlagiarismReport['matches'] = [];
  let maxSim = 0;

  for (const doc of corpus) {
    if (excludeRecordId && doc.id === excludeRecordId) continue;
    if (!doc.fullText || doc.fullText.length < 40) continue;

    const docShingles = buildShingles(doc.fullText, 5);
    if (docShingles.size === 0) continue;

    const overlap: string[] = [];
    for (const sh of targetShingles) {
      if (docShingles.has(sh)) {
        overlap.push(sh);
      }
    }

    if (overlap.length > 0) {
      const sim = round1(clamp((overlap.length / targetShingles.size) * 100, 0, 100));
      if (sim >= 3) {
        maxSim = Math.max(maxSim, sim);
        matches.push({
          sourceId: doc.id,
          sourceTitle: doc.title,
          similarityPercent: sim,
          matchedExcerpts: overlap.slice(0, 3),
        });
      }
    }
  }

  matches.sort((a, b) => b.similarityPercent - a.similarityPercent);
  return {
    overallSimilarityPercent: round1(maxSim),
    matches: matches.slice(0, 5),
  };
}

export function mergeSentencesWithModelScores(
  split: SplitSentence[],
  modelSentences?: { index: number; aiProbability: number; reason: string }[]
): SentenceAnalysis[] {
  return split.map((s, idx) => {
    const heuristic = scoreSentenceHeuristic(s.text);
    const modelHit = modelSentences?.find((m) => m.index === idx);
    const blended = modelHit
      ? round1(clamp(modelHit.aiProbability * 0.72 + heuristic.aiProbability * 0.28, 1, 99))
      : heuristic.aiProbability;

    const label: SentenceAnalysis['label'] =
      blended >= 65 ? 'AI' : blended >= 40 ? 'Uncertain' : 'Human';

    return {
      id: s.id,
      text: s.text,
      start: s.start,
      end: s.end,
      aiProbability: blended,
      label,
      reason: modelHit?.reason || heuristic.reason,
      perplexityProxy: heuristic.perplexityProxy,
      wordCount: heuristic.wordCount,
    };
  });
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

const AI_VOCAB_LIST = [
  'delve', 'tapestry', 'multifaceted', 'paradigm', 'testament', 'pivotal',
  'underscore', 'foster', 'leverage', 'streamline', 'ever-evolving', 'landscape',
  'embark', 'nuanced', 'harness', 'synergy', 'realm', 'beacon', 'interplay', 'intricate',
];

const SPINNER_PHRASES = [
  /\b(?:conversely|moreover|notwithstanding|consequently|furthermore)\b/gi,
  /\b(?:utilize|commence|endeavor|facilitate|ascertain|ameliorate|augment)\b/gi,
  /\b(?:in the realm of|it is imperative|a myriad of|plays an integral part|serves as a testament)\b/gi,
];

export function detectParaphraseSpin(
  text: string,
  writingQuality: WritingQualityMetrics,
  aiProbability: number
): ParaphraseSpinReport {
  const lower = text.toLowerCase();
  const aiVocabularyHits = AI_VOCAB_LIST.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));

  let spinnerMatches = 0;
  for (const rx of SPINNER_PHRASES) {
    spinnerMatches += (text.match(rx) || []).length;
  }

  const indicators: string[] = [];
  let spinScore = 10 + aiVocabularyHits.length * 9 + spinnerMatches * 6;

  // High thesaurus replacement signal: elevated lexical richness combined with suspiciously flat burstiness
  if (writingQuality.lexicalRichness > 72 && writingQuality.burstiness < 35) {
    spinScore += 22;
    indicators.push('High lexical synonym dispersion paired with flat sentence-length variance (classic synonym-spinner signature).');
  }
  if (aiVocabularyHits.length >= 2) {
    indicators.push(`Over-represented LLM lexicon cluster (${aiVocabularyHits.slice(0, 5).join(', ')}).`);
  }
  if (spinnerMatches >= 3) {
    indicators.push(`${spinnerMatches} formal thesaurus-substituted transition markers ("utilize", "ameliorate", "ascertain").`);
  }
  if (aiProbability >= 45 && aiProbability <= 72 && indicators.length > 0) {
    spinScore += 14;
    indicators.push('Mid-band perplexity profile consistent with AI-generated prose processed through a paraphraser.');
  }

  const spinProbability = round1(clamp(spinScore, 4, 96));
  const classification: ParaphraseSpinReport['classification'] =
    spinProbability >= 60
      ? 'AI-Paraphrased / Spun'
      : spinProbability >= 32
        ? 'Lightly Edited'
        : 'Authentic Prose';

  if (indicators.length === 0) {
    indicators.push('Syntax and vocabulary cadence align with organic authoring rather than automated spinning.');
  }

  return {
    spinProbability,
    classification,
    aiVocabularyHits,
    indicators,
  };
}

export function computeGeoAnalysis(text: string, title?: string): GeoAnalysisReport {
  const sentences = splitSentencesWithOffsets(text);
  const words = tokenizeWords(text);
  const wordCount = Math.max(1, words.length);

  // Named entities / proper-noun multi-word phrases & technical terms
  const entityMatches =
    text.match(/\b[A-Z][a-zA-Z0-9-]+(?:\s+[A-Z][a-zA-Z0-9-]+){0,3}\b/g) || [];
  const filteredEntities = Array.from(
    new Set(
      entityMatches.filter(
        (e) =>
          e.length > 2 &&
          !/^(The|This|That|These|However|Furthermore|Moreover|In|On|At|For|With|When|Why|How)$/i.test(e)
      )
    )
  ).slice(0, 12);

  const entityDensityScore = round1(
    clamp((filteredEntities.length / Math.max(1, wordCount / 40)) * 38 + 22, 18, 97)
  );

  // Direct-answer readiness: concise declarative definition/summary in first 2 sentences + question headers
  const leadText = sentences.slice(0, 2).map((s) => s.text).join(' ');
  const hasDirectAnswerLead =
    leadText.length >= 40 &&
    leadText.length <= 360 &&
    /\b(is|are|refers to|enables|provides|measures|reduces|combines)\b/i.test(leadText);
  const questionHeadings = (text.match(/^#{1,4}\s+.*\?$/gm) || []).length;
  const directAnswerReadiness = round1(
    clamp((hasDirectAnswerLead ? 64 : 34) + questionHeadings * 14, 20, 98)
  );

  // Schema & structural readiness: headings, bullet lists, tables/metrics
  const hasHeadings = /^#{1,4}\s+/m.test(text);
  const hasLists = /^[-*•\d]+[.)]\s+/m.test(text);
  const quantCount = (text.match(/\b\d+(?:\.\d+)?%?\b/g) || []).length;
  const schemaReadiness = round1(
    clamp(32 + (hasHeadings ? 26 : 0) + (hasLists ? 20 : 0) + (title ? 12 : 0), 20, 96)
  );

  const inlineCitations = extractInlineCitations(text);
  const citationWorthinessScore = round1(
    clamp(25 + Math.min(35, quantCount * 6) + Math.min(35, inlineCitations.length * 15), 15, 97)
  );

  const geoScore = round1(
    (entityDensityScore + directAnswerReadiness + schemaReadiness + citationWorthinessScore) / 4
  );

  const recommendations: string[] = [];
  if (!hasDirectAnswerLead) {
    recommendations.push('Open with a crisp 40–60 word direct-answer summary so AI answer engines can quote the lead cleanly.');
  }
  if (filteredEntities.length < 4) {
    recommendations.push('Anchor claims with specific named entities (standards, benchmarks, institutions, versions).');
  }
  if (!hasHeadings || !hasLists) {
    recommendations.push('Structure key takeaways using question-style H2/H3 headings and bulleted comparison lists for Schema/FAQ extraction.');
  }
  if (inlineCitations.length === 0) {
    recommendations.push('Include primary source links or quantitative studies to boost AI citation probability.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Strong GEO readiness: clear entity anchoring, direct lead framing, and structured headings.');
  }

  return {
    geoScore,
    entityDensityScore,
    directAnswerReadiness,
    schemaReadiness,
    citationWorthinessScore,
    detectedEntities: filteredEntities,
    recommendations,
  };
}

const FUNCTION_WORDS = [
  'the', 'of', 'and', 'to', 'in', 'a', 'is', 'that', 'it', 'was', 'for', 'on', 'with', 'as', 'but', 'or',
];

export function computeAuthorVector(text: string): {
  vector: AuthorStylometricVector;
  wordCount: number;
} {
  const { readability, writingQuality, wordCount } = computeReadabilityAndQuality(text);
  const words = tokenizeWords(text);
  const safeWords = Math.max(1, words.length);
  const totalWordChars = words.reduce((s, w) => s + w.length, 0);
  const avgWordLength = round2(totalWordChars / safeWords);
  const punctuationMatches = text.match(/[,;:\-—()?!]/g) || [];
  const punctuationPer100Words = round2((punctuationMatches.length / safeWords) * 100);
  const contractionMatches = text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || [];
  const contractionRate = round2((contractionMatches.length / safeWords) * 100);

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const functionWordRatios = FUNCTION_WORDS.map((fw) =>
    round3(((freq.get(fw) || 0) / safeWords) * 100)
  );

  return {
    wordCount,
    vector: {
      avgSentenceLength: readability.avgSentenceLength,
      burstiness: writingQuality.burstiness,
      typeTokenRatio: writingQuality.typeTokenRatio,
      hapaxRatio: writingQuality.hapaxRatio,
      avgWordLength,
      punctuationPer100Words,
      contractionRate,
      functionWordRatios,
    },
  };
}

export function blendAuthorVectors(
  prev: AuthorStylometricVector,
  prevCount: number,
  next: AuthorStylometricVector
): AuthorStylometricVector {
  const w1 = prevCount;
  const w2 = 1;
  const total = w1 + w2;
  const avg = (a: number, b: number) => round3((a * w1 + b * w2) / total);
  return {
    avgSentenceLength: avg(prev.avgSentenceLength, next.avgSentenceLength),
    burstiness: avg(prev.burstiness, next.burstiness),
    typeTokenRatio: avg(prev.typeTokenRatio, next.typeTokenRatio),
    hapaxRatio: avg(prev.hapaxRatio, next.hapaxRatio),
    avgWordLength: avg(prev.avgWordLength, next.avgWordLength),
    punctuationPer100Words: avg(prev.punctuationPer100Words, next.punctuationPer100Words),
    contractionRate: avg(prev.contractionRate, next.contractionRate),
    functionWordRatios: prev.functionWordRatios.map((v, idx) =>
      avg(v, next.functionWordRatios[idx] || 0)
    ),
  };
}

export function compareAuthorDrift(
  profileId: string,
  authorName: string,
  baseline: AuthorStylometricVector,
  sample: AuthorStylometricVector
): AuthorDriftVerification {
  const flatA = [
    baseline.avgSentenceLength / 30,
    baseline.burstiness / 100,
    baseline.typeTokenRatio,
    baseline.hapaxRatio,
    baseline.avgWordLength / 8,
    baseline.punctuationPer100Words / 20,
    baseline.contractionRate / 5,
    ...baseline.functionWordRatios.map((r) => r / 10),
  ];
  const flatB = [
    sample.avgSentenceLength / 30,
    sample.burstiness / 100,
    sample.typeTokenRatio,
    sample.hapaxRatio,
    sample.avgWordLength / 8,
    sample.punctuationPer100Words / 20,
    sample.contractionRate / 5,
    ...sample.functionWordRatios.map((r) => r / 10),
  ];

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < flatA.length; i++) {
    dot += flatA[i] * flatB[i];
    normA += flatA[i] * flatA[i];
    normB += flatB[i] * flatB[i];
  }
  const cosineSimilarity = round3(dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1));

  const divergingDimensions: string[] = [];
  if (Math.abs(baseline.avgSentenceLength - sample.avgSentenceLength) > 6) {
    divergingDimensions.push(
      `Sentence length shifted (${baseline.avgSentenceLength} -> ${sample.avgSentenceLength} words)`
    );
  }
  if (Math.abs(baseline.burstiness - sample.burstiness) > 18) {
    divergingDimensions.push(
      `Syntactic burstiness diverged (${baseline.burstiness}% -> ${sample.burstiness}%)`
    );
  }
  if (Math.abs(baseline.contractionRate - sample.contractionRate) > 1.8) {
    divergingDimensions.push(
      `Contraction cadence shifted (${baseline.contractionRate} -> ${sample.contractionRate} per 100 words)`
    );
  }
  if (Math.abs(baseline.punctuationPer100Words - sample.punctuationPer100Words) > 4.5) {
    divergingDimensions.push(
      `Punctuation rhythm shifted (${baseline.punctuationPer100Words} -> ${sample.punctuationPer100Words} per 100 words)`
    );
  }

  const rawDrift = (1 - cosineSimilarity) * 280 + divergingDimensions.length * 10;
  const driftScore = round1(clamp(rawDrift, 2, 98));
  const matchVerdict: AuthorDriftVerification['matchVerdict'] =
    driftScore >= 58
      ? 'Significant Authorship Drift'
      : driftScore >= 32
        ? 'Moderate Stylistic Shift'
        : 'Consistent Authorship';

  return {
    profileId,
    authorName,
    driftScore,
    matchVerdict,
    cosineSimilarity,
    divergingDimensions:
      divergingDimensions.length > 0
        ? divergingDimensions
        : ['Core function-word distribution and cadence align with author baseline.'],
  };
}

