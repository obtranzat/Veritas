import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'node:crypto';
import type {
  CitationEntailmentResult,
  CitationEntry,
  CrossLingualMatch,
  DeepfakeIndicator,
  FactCheckReport,
  HumanizationIntensity,
} from '../types/veritas.ts';
import type { SplitSentence } from './stylometry.ts';

let _client: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || /^your_.*_here$/i.test(apiKey)) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in the Settings > Secrets panel.'
    );
  }
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _client;
}

function classifySourceCredibility(
  url: string
): 'Academic / Gov' | 'Primary / Reference' | 'News / Editorial' | 'General Web' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      /\.(edu|gov|ac\.uk|org)$/i.test(host) ||
      /(arxiv\.org|nature\.com|science\.org|pubmed|ncbi\.nlm\.nih\.gov|ieee\.org|acm\.org|springer\.com|jstor\.org)/i.test(
        host
      )
    ) {
      return 'Academic / Gov';
    }
    if (/(wikipedia\.org|britannica\.com|who\.int|un\.org|iso\.org|rfc-editor\.org)/i.test(host)) {
      return 'Primary / Reference';
    }
    if (/(reuters\.com|apnews\.com|bbc\.com|nytimes\.com|ft\.com|economist\.com|theguardian\.com|npr\.org)/i.test(host)) {
      return 'News / Editorial';
    }
  } catch {
    // ignore invalid URL
  }
  return 'General Web';
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface GeminiDetectionResult {
  overallAiProbability: number;
  confidence: number;
  suspectedModelFamily: string;
  detectedLanguage: string;
  summary: string;
  sentenceScores: {
    index: number;
    aiProbability: number;
    reason: string;
  }[];
  contentCritique?: {
    detectedTone: string;
    strengths: string[];
    recommendations: string[];
  };
}

export async function analyzeTextWithGemini(
  text: string,
  sentences: SplitSentence[]
): Promise<GeminiDetectionResult> {
  const ai = getAiClient();
  const cappedSentences = sentences.slice(0, 60).map((s, idx) => `[${idx}] ${s.text}`);
  const prompt = [
    'Analyze the following numbered sentences for likelihood of AI generation vs human authorship, plus editorial content quality.',
    'Evaluate discourse uniformity, semantic hedging, rhythmic symmetry, cliché transitions, specificity of lived detail, and structural variance.',
    'Return an overall AI probability (0-100), confidence (0-100), suspected model family, detected language, a concise 2-sentence forensic summary, per-sentence scores for the provided indices, and editorial strengths/recommendations.',
    '',
    'Numbered sentences:',
    cappedSentences.join('\n'),
    '',
    text.length > 8000 ? `(Truncated full text preview: ${text.slice(0, 2000)})` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are an objective computational forensics and editorial quality analyst. Be calibrated, nuanced, and avoid false positives on formal academic or technical human prose.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallAiProbability: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
          suspectedModelFamily: { type: Type.STRING },
          detectedLanguage: { type: Type.STRING },
          summary: { type: Type.STRING },
          sentenceScores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER },
                aiProbability: { type: Type.NUMBER },
                reason: { type: Type.STRING },
              },
              required: ['index', 'aiProbability', 'reason'],
            },
          },
          contentCritique: {
            type: Type.OBJECT,
            properties: {
              detectedTone: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['detectedTone', 'strengths', 'recommendations'],
          },
        },
        required: [
          'overallAiProbability',
          'confidence',
          'suspectedModelFamily',
          'detectedLanguage',
          'summary',
          'sentenceScores',
        ],
      },
    },
  });

  const raw = (response.text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response during text detection.');
  }
  return JSON.parse(raw) as GeminiDetectionResult;
}

export async function factCheckAndVerifySourcesWithGemini(
  text: string
): Promise<FactCheckReport> {
  const ai = getAiClient();

  // Step 1: Use Google Search grounding to retrieve real-world verification evidence
  const groundedResponse = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Extract up to 6 specific, verifiable factual claims from the text below and fact-check each claim against live web search results.',
      'For every claim, clearly state whether it is Verified, Disputed, Needs Context, or Unverified, explain why with concrete evidence, and cite the relevant retrieved sources.',
      '',
      'Text to verify:',
      text.slice(0, 12000),
    ].join('\n'),
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const groundedNotes = (groundedResponse.text || '').trim();
  const chunks =
    groundedResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const groundingSources = chunks
    .filter((c) => c.web?.uri)
    .map((c) => ({
      title: c.web!.title || safeDomain(c.web!.uri!),
      url: c.web!.uri!,
      domain: safeDomain(c.web!.uri!),
      credibilityTier: classifySourceCredibility(c.web!.uri!),
    }));

  // Deduplicate grounding sources by URL
  const uniqueSourcesMap = new Map<string, (typeof groundingSources)[number]>();
  for (const src of groundingSources) {
    if (!uniqueSourcesMap.has(src.url)) {
      uniqueSourcesMap.set(src.url, src);
    }
  }
  const uniqueSources = Array.from(uniqueSourcesMap.values()).slice(0, 12);

  // Step 2: Structure the grounded verification findings into strict typed JSON
  const structuredResponse = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Convert the following grounded fact-check verification notes into structured JSON.',
      'Only attach source URLs from the provided Verified Grounding Sources list when matching a claim.',
      '',
      'Verification Notes:',
      groundedNotes,
      '',
      'Verified Grounding Sources:',
      JSON.stringify(uniqueSources),
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallVeracityScore: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                status: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
                sourceUrls: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['claim', 'status', 'confidence', 'explanation', 'sourceUrls'],
            },
          },
        },
        required: ['overallVeracityScore', 'summary', 'claims'],
      },
    },
  });

  const parsed = JSON.parse((structuredResponse.text || '{}').trim()) as {
    overallVeracityScore: number;
    summary: string;
    claims: {
      claim: string;
      status: string;
      confidence: number;
      explanation: string;
      sourceUrls: string[];
    }[];
  };

  const formattedClaims = (parsed.claims || []).map((c, idx) => {
    const normalizedStatus: 'Verified' | 'Disputed' | 'Unverified' | 'Needs Context' =
      c.status === 'Verified' ||
      c.status === 'Disputed' ||
      c.status === 'Needs Context'
        ? c.status
        : 'Unverified';

    const matchedSources = (c.sourceUrls || [])
      .map((u) => uniqueSourcesMap.get(u) || {
        title: safeDomain(u),
        url: u,
        domain: safeDomain(u),
        credibilityTier: classifySourceCredibility(u),
      })
      .slice(0, 3);

    return {
      id: `clm-${idx + 1}`,
      claim: c.claim,
      status: normalizedStatus,
      confidence: Math.max(10, Math.min(99, Math.round(c.confidence || 75))),
      explanation: c.explanation,
      sources: matchedSources.length > 0 ? matchedSources : uniqueSources.slice(0, 2),
    };
  });

  const verifiedCount = formattedClaims.filter((c) => c.status === 'Verified').length;
  const disputedCount = formattedClaims.filter((c) => c.status === 'Disputed').length;
  const unverifiedCount = formattedClaims.filter(
    (c) => c.status === 'Unverified' || c.status === 'Needs Context'
  ).length;

  return {
    checkedAt: new Date().toISOString(),
    overallVeracityScore: Math.max(
      0,
      Math.min(100, Math.round((parsed.overallVeracityScore ?? 70) * 10) / 10)
    ),
    verifiedCount,
    disputedCount,
    unverifiedCount,
    summary: parsed.summary || 'Grounded verification complete.',
    claims: formattedClaims,
    groundingSources: uniqueSources,
  };
}

export async function checkWebPlagiarismWithGemini(text: string): Promise<{
  webMatches: {
    url: string;
    title: string;
    matchedExcerpt: string;
    similarityNote: string;
  }[];
}> {
  const ai = getAiClient();
  const excerpt = text.slice(0, 4000);

  const grounded = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Search the web to check whether distinctive multi-sentence passages from the following text already appear verbatim or near-verbatim on public websites, papers, or blogs.',
      'List any matching web sources with their URL, page title, the overlapping excerpt, and a short note.',
      '',
      excerpt,
    ].join('\n'),
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const candidateUrls = chunks
    .filter((c) => c.web?.uri)
    .map((c) => ({ url: c.web!.uri!, title: c.web!.title || safeDomain(c.web!.uri!) }));

  const structured = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Based strictly on these web search findings and retrieved URLs, list only genuine overlapping web matches (return empty array if text is original).',
      'Findings:',
      grounded.text || '',
      'Retrieved URLs:',
      JSON.stringify(candidateUrls),
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          webMatches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                url: { type: Type.STRING },
                title: { type: Type.STRING },
                matchedExcerpt: { type: Type.STRING },
                similarityNote: { type: Type.STRING },
              },
              required: ['url', 'title', 'matchedExcerpt', 'similarityNote'],
            },
          },
        },
        required: ['webMatches'],
      },
    },
  });

  return JSON.parse((structured.text || '{"webMatches":[]}').trim()) as {
    webMatches: {
      url: string;
      title: string;
      matchedExcerpt: string;
      similarityNote: string;
    }[];
  };
}

export async function lookupCitationWithGemini(
  query: string
): Promise<Omit<CitationEntry, 'id' | 'createdAt' | 'tags'>> {
  const ai = getAiClient();

  const grounded = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Find accurate bibliographic details (exact title, authors, publication year, journal or publisher, DOI if any, and canonical URL) for this citation query or URL: "${query}"`,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const urls = chunks.filter((c) => c.web?.uri).map((c) => c.web!.uri!);

  const structured = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Extract clean bibliographic metadata into JSON.',
      grounded.text || '',
      urls.length ? `Candidate URLs: ${urls.join(', ')}` : '',
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          authors: { type: Type.ARRAY, items: { type: Type.STRING } },
          year: { type: Type.STRING },
          publisherOrJournal: { type: Type.STRING },
          url: { type: Type.STRING },
          doi: { type: Type.STRING },
          sourceType: { type: Type.STRING },
          verified: { type: Type.BOOLEAN },
        },
        required: ['title', 'authors', 'year', 'publisherOrJournal', 'sourceType', 'verified'],
      },
    },
  });

  const parsed = JSON.parse((structured.text || '{}').trim()) as {
    title: string;
    authors: string[];
    year: string;
    publisherOrJournal: string;
    url?: string;
    doi?: string;
    sourceType: string;
    verified: boolean;
  };

  const validSourceType: CitationEntry['sourceType'] =
    parsed.sourceType === 'Journal Article' ||
    parsed.sourceType === 'Book' ||
    parsed.sourceType === 'Report' ||
    parsed.sourceType === 'Dataset'
      ? parsed.sourceType
      : 'Web Page';

  return {
    title: parsed.title || query,
    authors: parsed.authors?.length ? parsed.authors : ['Unknown Author'],
    year: parsed.year || String(new Date().getFullYear()),
    publisherOrJournal: parsed.publisherOrJournal || 'Web Source',
    url: parsed.url || urls[0] || undefined,
    doi: parsed.doi || undefined,
    sourceType: validSourceType,
    verificationStatus: parsed.verified ? 'Verified Source' : 'Needs Review',
  };
}

export interface GeminiHumanizeResult {
  humanizedText: string;
  preservedFactsNotes: string[];
  changesSummary: string;
}

export async function humanizeTextWithGemini(
  text: string,
  intensity: HumanizationIntensity
): Promise<GeminiHumanizeResult> {
  const ai = getAiClient();
  const intensityGuide: Record<HumanizationIntensity, string> = {
    light:
      'LIGHT intensity: Preserve almost all phrasing and structure; subtly break repetitive transitions, allow natural contractions where appropriate, and vary 20-30% of overly uniform sentence openings.',
    moderate:
      'MODERATE intensity: Rebalance sentence cadence and burstiness, replace formulaic LLM transitions and corporate boilerplate with idiomatic human phrasing, vary paragraph rhythm while preserving every fact, number, citation, and markdown/paragraph structure.',
    aggressive:
      'AGGRESSIVE intensity: Deeply restructure syntax and rhetorical pacing into vivid, natural human prose with varied sentence lengths, concrete verbs, and organic voice while strictly preserving 100% of original facts, claims, entities, and formatting.',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${intensityGuide[intensity]}\n\nRewrite the following text so it reads authentically human without losing meaning, facts, or structural formatting:\n\n${text}`,
    config: {
      systemInstruction:
        'You are a senior editorial rewriter. Your job is to transform stiff or AI-patterned prose into natural, readable human writing while preserving every factual detail, statistic, and structural element.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          humanizedText: { type: Type.STRING },
          preservedFactsNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
          changesSummary: { type: Type.STRING },
        },
        required: ['humanizedText', 'preservedFactsNotes', 'changesSummary'],
      },
    },
  });

  const raw = (response.text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response during humanization.');
  }
  return JSON.parse(raw) as GeminiHumanizeResult;
}

export interface GeminiImageForensicsResult {
  ocrText: string;
  syntheticProbability: number;
  summary: string;
  deepfakeIndicators: DeepfakeIndicator[];
  suspectedGenerator: string;
}

export async function inspectImageWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<GeminiImageForensicsResult> {
  const ai = getAiClient();
  const base64Data = buffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: 'Perform two tasks on this image: (1) Extract all visible text verbatim (OCR). (2) Perform visual AI-generation & deepfake forensics: examine skin/fabric micro-textures, lighting and shadow physics, hands/typography/background geometry, compression artifacts, and diffusion fingerprints.',
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ocrText: { type: Type.STRING },
          syntheticProbability: { type: Type.NUMBER },
          suspectedGenerator: { type: Type.STRING },
          summary: { type: Type.STRING },
          deepfakeIndicators: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                severity: { type: Type.STRING },
                detail: { type: Type.STRING },
              },
              required: ['category', 'severity', 'detail'],
            },
          },
        },
        required: [
          'ocrText',
          'syntheticProbability',
          'suspectedGenerator',
          'summary',
          'deepfakeIndicators',
        ],
      },
    },
  });

  const raw = (response.text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response during image forensics.');
  }
  const parsed = JSON.parse(raw) as GeminiImageForensicsResult;
  parsed.deepfakeIndicators = (parsed.deepfakeIndicators || []).map((ind) => ({
    category: ind.category,
    severity:
      ind.severity === 'High' || ind.severity === 'Medium' || ind.severity === 'Low'
        ? ind.severity
        : 'Low',
    detail: ind.detail,
  }));
  return parsed;
}

export async function transcribeAudioWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ai = getAiClient();
  const base64Data = buffer.toString('base64');
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: 'Transcribe all spoken words in this audio file accurately with punctuation.',
        },
      ],
    },
  });
  return (response.text || '').trim();
}

export interface GeminiVideoForensicsResult {
  transcript: string;
  syntheticProbability: number;
  frameConsistencyScore: number;
  audioSyncAssessment: string;
  suspectedGenerator: string;
  summary: string;
  deepfakeIndicators: DeepfakeIndicator[];
}

export async function inspectVideoWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<GeminiVideoForensicsResult> {
  const ai = getAiClient();
  const base64Data = buffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: 'Inspect this video clip for AI generation, deepfake manipulation, frame-by-frame temporal consistency, lip/audio synchronization, and spoken dialogue transcription. Return structured forensic findings.',
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          syntheticProbability: { type: Type.NUMBER },
          frameConsistencyScore: { type: Type.NUMBER },
          audioSyncAssessment: { type: Type.STRING },
          suspectedGenerator: { type: Type.STRING },
          summary: { type: Type.STRING },
          deepfakeIndicators: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                severity: { type: Type.STRING },
                detail: { type: Type.STRING },
              },
              required: ['category', 'severity', 'detail'],
            },
          },
        },
        required: [
          'transcript',
          'syntheticProbability',
          'frameConsistencyScore',
          'audioSyncAssessment',
          'suspectedGenerator',
          'summary',
          'deepfakeIndicators',
        ],
      },
    },
  });

  const raw = (response.text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response during video forensics.');
  }
  const parsed = JSON.parse(raw) as GeminiVideoForensicsResult;
  parsed.deepfakeIndicators = (parsed.deepfakeIndicators || []).map((ind) => ({
    category: ind.category,
    severity:
      ind.severity === 'High' || ind.severity === 'Medium' || ind.severity === 'Low'
        ? ind.severity
        : 'Low',
    detail: ind.detail,
  }));
  return parsed;
}

export function generateCitationId(): string {
  return `cit-${crypto.randomUUID().slice(0, 8)}`;
}

export async function checkCrossLingualPlagiarismWithGemini(
  text: string
): Promise<CrossLingualMatch[]> {
  const ai = getAiClient();
  const excerpt = text.slice(0, 3500);

  const grounded = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Translate key distinctive arguments and passages of the text below mentally into major scholarly/web languages (Spanish, French, German, Portuguese, Chinese, Japanese) and search the web for matching previously published articles or translations.',
      'Report any potential cross-language plagiarism matches found with source URL, title, source language, original-language passage, and translated English comparison.',
      '',
      excerpt,
    ].join('\n'),
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const candidateUrls = chunks
    .filter((c) => c.web?.uri)
    .map((c) => ({ url: c.web!.uri!, title: c.web!.title || safeDomain(c.web!.uri!) }));

  const structured = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Convert the cross-lingual search findings into structured JSON. Only include genuine semantic/translated overlap matches from the retrieved URLs (return empty array if none found).',
      grounded.text || '',
      JSON.stringify(candidateUrls),
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sourceUrl: { type: Type.STRING },
                sourceTitle: { type: Type.STRING },
                sourceLanguage: { type: Type.STRING },
                matchedOriginalExcerpt: { type: Type.STRING },
                translatedMatchExcerpt: { type: Type.STRING },
                similarityNote: { type: Type.STRING },
              },
              required: [
                'sourceUrl',
                'sourceTitle',
                'sourceLanguage',
                'matchedOriginalExcerpt',
                'translatedMatchExcerpt',
                'similarityNote',
              ],
            },
          },
        },
        required: ['matches'],
      },
    },
  });

  const parsed = JSON.parse((structured.text || '{"matches":[]}').trim()) as {
    matches: CrossLingualMatch[];
  };
  return parsed.matches || [];
}

export async function verifyCitationEntailmentWithGemini(
  claim: string,
  citationUrl: string
): Promise<CitationEntailmentResult> {
  const ai = getAiClient();

  const grounded = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      `Inspect the cited source (${citationUrl}) via Google Search / URL context and test semantic entailment for this claim:`,
      `Claim: "${claim}"`,
      'Determine strictly whether the cited source Supports, Partially Supports, Contradicts, or Does Not Mention the claim. Quote relevant evidence.',
    ].join('\n'),
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const chunks = grounded.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const firstSourceTitle = chunks[0]?.web?.title || safeDomain(citationUrl);

  const structured = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      'Convert the citation entailment audit into strict JSON.',
      `Claim: ${claim}`,
      `Cited URL: ${citationUrl}`,
      `Source Title: ${firstSourceTitle}`,
      grounded.text || '',
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
          matchedEvidenceQuote: { type: Type.STRING },
          sourceTitle: { type: Type.STRING },
        },
        required: ['status', 'confidence', 'rationale', 'matchedEvidenceQuote', 'sourceTitle'],
      },
    },
  });

  const parsed = JSON.parse((structured.text || '{}').trim()) as {
    status: string;
    confidence: number;
    rationale: string;
    matchedEvidenceQuote: string;
    sourceTitle: string;
  };

  const validStatus: CitationEntailmentResult['status'] =
    parsed.status === 'Supported' ||
    parsed.status === 'Partially Supported' ||
    parsed.status === 'Contradicted'
      ? parsed.status
      : 'Not Found in Source';

  return {
    claim,
    citationUrl,
    status: validStatus,
    confidence: Math.max(15, Math.min(99, Math.round(parsed.confidence || 75))),
    rationale: parsed.rationale || 'Entailment verification completed.',
    matchedEvidenceQuote: parsed.matchedEvidenceQuote || 'No direct verbatim quote matched.',
    sourceTitle: parsed.sourceTitle || firstSourceTitle,
  };
}

export interface GeminiCodeForensicsResult {
  aiCodeProbability: number;
  confidence: number;
  suspectedAssistant: string;
  summary: string;
  llmIdiomFindings: string[];
  securityNotes: string[];
}

export async function inspectCodeWithGemini(
  code: string,
  language: string
): Promise<GeminiCodeForensicsResult> {
  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      `Analyze this ${language} source code for likelihood of AI coding assistant generation (Copilot/GPT/Claude/Gemini), stylistic idioms, and security or license hygiene issues.`,
      '```' + language.toLowerCase(),
      code.slice(0, 12000),
      '```',
    ].join('\n'),
    config: {
      systemInstruction:
        'You are a static analysis and AI-code forensics engineer. Evaluate comment cadence, textbook defensive boilerplate, naming symmetry, and security vulnerabilities.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          aiCodeProbability: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
          suspectedAssistant: { type: Type.STRING },
          summary: { type: Type.STRING },
          llmIdiomFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
          securityNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'aiCodeProbability',
          'confidence',
          'suspectedAssistant',
          'summary',
          'llmIdiomFindings',
          'securityNotes',
        ],
      },
    },
  });

  const raw = (response.text || '').trim();
  if (!raw) {
    throw new Error('Model returned an empty response during code analysis.');
  }
  return JSON.parse(raw) as GeminiCodeForensicsResult;
}

