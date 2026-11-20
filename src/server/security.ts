import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import type {
  AdversarialSecurityReport,
  DetectionRecord,
  ExclusionFilters,
  FilteredScoreResult,
  VeritasProofBundle,
} from '../types/veritas.ts';
import { checkPlagiarismAgainstCorpus, splitSentencesWithOffsets } from './stylometry.ts';

const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0410': 'A', '\u0430': 'a', // Cyrillic A/a
  '\u0412': 'B', '\u0435': 'e', '\u0415': 'E',
  '\u041a': 'K', '\u043a': 'k',
  '\u041c': 'M', '\u041d': 'H',
  '\u041e': 'O', '\u043e': 'o',
  '\u0420': 'P', '\u0440': 'p',
  '\u0421': 'C', '\u0441': 'c',
  '\u0422': 'T', '\u0443': 'y', '\u0425': 'X', '\u0445': 'x',
  '\u0456': 'i', '\u0406': 'I', '\u0458': 'j', '\u0455': 's',
  '\u0391': 'A', '\u03b1': 'a', '\u0392': 'B', '\u0395': 'E',
  '\u0399': 'I', '\u039a': 'K', '\u039c': 'M', '\u039d': 'N',
  '\u039f': 'O', '\u03bf': 'o', '\u03a1': 'P', '\u03c1': 'p',
  '\u03a4': 'T', '\u03a7': 'X', '\u03c5': 'u',
};

const PROMPT_INJECTION_PATTERNS: { rx: RegExp; label: string }[] = [
  { rx: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, label: 'Instruction override directive ("ignore previous instructions")' },
  { rx: /(score|rate|classify)\s+this\s+(text|submission|essay)?\s*(as\s*)?(0%|human|100%\s*human)/i, label: 'Detector score manipulation attempt' },
  { rx: /you\s+are\s+now\s+(in\s+)?(developer|admin|system)\s+mode/i, label: 'System role hijacking payload' },
  { rx: /<\/?(system|instruction|prompt|override)>/i, label: 'Delimited prompt-tag spoofing' },
  { rx: /disregard\s+(the\s+)?rubric|output\s+only\s+human/i, label: 'Evaluation rubric bypass attempt' },
];

const HIDDEN_TEXT_PATTERNS: { rx: RegExp; label: string }[] = [
  { rx: /font-size:\s*0(?:px|pt|em)?/i, label: 'Zero-pixel hidden CSS span' },
  { rx: /color:\s*(?:#fff(?:fff)?|white|transparent)/i, label: 'White-on-white / transparent hidden text' },
  { rx: /display:\s*none|visibility:\s*hidden|opacity:\s*0(?:\.0+)?(?:\s|;)/i, label: 'CSS invisible content container' },
];

export function inspectAdversarialAndNormalize(rawText: string): {
  normalizedText: string;
  report: AdversarialSecurityReport;
} {
  const zeroWidthMatches = rawText.match(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g) || [];
  const bidiMatches = rawText.match(/[\u202A-\u202E\u2066-\u2069]/g) || [];

  let homoglyphCount = 0;
  let normalizedText = '';
  for (const ch of rawText) {
    if (/[\u200B-\u200D\u2060\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/.test(ch)) {
      continue;
    }
    const mapped = HOMOGLYPH_MAP[ch];
    if (mapped) {
      homoglyphCount += 1;
      normalizedText += mapped;
    } else {
      normalizedText += ch;
    }
  }

  const promptInjectionFlags: string[] = [];
  for (const pat of PROMPT_INJECTION_PATTERNS) {
    if (pat.rx.test(normalizedText)) {
      promptInjectionFlags.push(pat.label);
    }
  }

  const hiddenTextFlags: string[] = [];
  for (const pat of HIDDEN_TEXT_PATTERNS) {
    if (pat.rx.test(rawText)) {
      hiddenTextFlags.push(pat.label);
    }
  }

  const piiMatches =
    normalizedText.match(
      /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{3}-\d{2}-\d{4}\b|\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b)/gi
    ) || [];

  const evasionDetected =
    zeroWidthMatches.length > 0 ||
    homoglyphCount > 0 ||
    bidiMatches.length > 0 ||
    promptInjectionFlags.length > 0 ||
    hiddenTextFlags.length > 0;

  const parts: string[] = [];
  if (zeroWidthMatches.length > 0) parts.push(`${zeroWidthMatches.length} invisible zero-width char(s) stripped`);
  if (homoglyphCount > 0) parts.push(`${homoglyphCount} cross-script homoglyph(s) canonicalized`);
  if (bidiMatches.length > 0) parts.push(`${bidiMatches.length} bidirectional override(s) removed`);
  if (promptInjectionFlags.length > 0) parts.push(`${promptInjectionFlags.length} prompt-injection vector(s) quarantined`);
  if (hiddenTextFlags.length > 0) parts.push(`${hiddenTextFlags.length} hidden-styling marker(s) flagged`);

  const normalizedDiffSummary =
    parts.length > 0
      ? parts.join(' · ')
      : 'Clean Unicode stream — no invisible obfuscation or injection artifacts detected.';

  return {
    normalizedText: normalizedText.trim(),
    report: {
      evasionDetected,
      zeroWidthCount: zeroWidthMatches.length,
      homoglyphCount,
      bidiControlCount: bidiMatches.length,
      promptInjectionFlags,
      hiddenTextFlags,
      normalizedDiffSummary,
      piiDetectedCount: piiMatches.length,
    },
  };
}

export function redactPiiForExternalAirlock(text: string): {
  redactedText: string;
  redactionCount: number;
} {
  let count = 0;
  let out = text;

  const rules: [RegExp, string][] = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]'],
    [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]'],
    [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[REDACTED_PHONE]'],
    [/\b(?:4\d{3}|5[1-5]\d{2}|6011)[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_CARD]'],
    [/\b(?:sk|vrt|ghp|AIza)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_SECRET]'],
  ];

  for (const [rx, replacement] of rules) {
    out = out.replace(rx, () => {
      count += 1;
      return replacement;
    });
  }

  return { redactedText: out, redactionCount: count };
}

export function recalculateWithExclusionFilters(
  record: DetectionRecord,
  filters: ExclusionFilters,
  corpus: DetectionRecord[]
): FilteredScoreResult {
  const originalWords = record.fullText.split(/\s+/).filter(Boolean).length;
  let workingText = record.fullText;

  if (filters.excludeBibliography) {
    workingText = workingText.replace(
      /\n+(?:References|Bibliography|Works Cited|Sources)\b[\s\S]*$/i,
      ''
    );
  }

  if (filters.excludeQuotes) {
    workingText = workingText
      .replace(/[“"][^”"]{12,}[”"]/g, ' ')
      .replace(/^\s*>\s+.*$/gm, ' ');
  }

  if (filters.excludeHeaders) {
    workingText = workingText
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (/^#{1,6}\s+/.test(trimmed)) return false;
        if (/^(?:Title|Author|Date|Course|Instructor|Abstract|Keywords)\s*:/i.test(trimmed)) {
          return false;
        }
        return trimmed.split(/\s+/).length >= 4 || /[.!?]$/.test(trimmed);
      })
      .join('\n');
  }

  const remainingWords = workingText.split(/\s+/).filter(Boolean).length;
  const excludedWordCount = Math.max(0, originalWords - remainingWords);

  // Filter matched sentences against remaining prose
  const remainingSentences = splitSentencesWithOffsets(workingText);
  const retainedSentenceTexts = new Set(remainingSentences.map((s) => s.text.trim()));
  const matchedSentences = record.sentences.filter((s) => retainedSentenceTexts.has(s.text.trim()));

  let adjustedAiProbability = record.aiProbability;
  if (matchedSentences.length > 0) {
    const avgFiltered =
      matchedSentences.reduce((sum, s) => sum + s.aiProbability, 0) / matchedSentences.length;
    adjustedAiProbability = Math.round((record.aiProbability * 0.35 + avgFiltered * 0.65) * 10) / 10;
  }

  // Recompute plagiarism with minMatchWords threshold & filtered text
  const nGramSize = Math.max(3, Math.min(12, filters.minMatchWords || 5));
  const targetTokens = (workingText.toLowerCase().match(/\b[\p{L}\p{N}'’-]+\b/gu) || []);
  let adjustedPlag = 0;

  if (targetTokens.length >= nGramSize) {
    const targetShingles = new Set<string>();
    for (let i = 0; i <= targetTokens.length - nGramSize; i++) {
      targetShingles.add(targetTokens.slice(i, i + nGramSize).join(' '));
    }

    for (const doc of corpus) {
      if (doc.id === record.id || !doc.fullText) continue;
      const docTokens = (doc.fullText.toLowerCase().match(/\b[\p{L}\p{N}'’-]+\b/gu) || []);
      if (docTokens.length < nGramSize) continue;
      const docShingles = new Set<string>();
      for (let i = 0; i <= docTokens.length - nGramSize; i++) {
        docShingles.add(docTokens.slice(i, i + nGramSize).join(' '));
      }
      let overlap = 0;
      for (const sh of targetShingles) {
        if (docShingles.has(sh)) overlap += 1;
      }
      const sim = Math.round(((overlap / Math.max(1, targetShingles.size)) * 100) * 10) / 10;
      if (sim > adjustedPlag) adjustedPlag = sim;
    }
  } else {
    adjustedPlag = checkPlagiarismAgainstCorpus(workingText, corpus, record.id).overallSimilarityPercent;
  }

  const activeLabels: string[] = [];
  if (filters.excludeQuotes) activeLabels.push('Quotes excluded');
  if (filters.excludeBibliography) activeLabels.push('Bibliography excluded');
  if (filters.excludeHeaders) activeLabels.push('Masked headers active');
  activeLabels.push(`Min match ${nGramSize} words`);

  return {
    filters,
    adjustedAiProbability,
    adjustedPlagiarismPercent: adjustedPlag,
    excludedWordCount,
    remainingWordCount: remainingWords,
    note: `${activeLabels.join(' · ')} (${excludedWordCount} boilerplate/excluded words omitted).`,
  };
}

export function generateEd25519Keypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return crypto.createHash('sha256').update('').digest('hex');
  }
  let layer = [...hashes];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] || left;
      next.push(crypto.createHash('sha256').update(left + right).digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}

export function createSignedVeritasProof(params: {
  documentTitle: string;
  authorLabel: string;
  content: string;
  durationSeconds: number;
  keystrokeEvents: number;
  pasteEvents: number;
  editBurstCount: number;
  chunkHashes?: string[];
  publicKeyPem: string;
  privateKeyPem: string;
}): VeritasProofBundle {
  const contentSha256 = crypto.createHash('sha256').update(params.content, 'utf8').digest('hex');
  const effectiveChunks =
    params.chunkHashes && params.chunkHashes.length > 0
      ? params.chunkHashes
      : params.content
          .split(/\n{2,}/)
          .filter((p) => p.trim().length > 0)
          .map((p) => crypto.createHash('sha256').update(p).digest('hex'));

  const merkleRoot = computeMerkleRoot(
    effectiveChunks.length > 0 ? effectiveChunks : [contentSha256]
  );

  const totalActions = Math.max(1, params.keystrokeEvents + params.pasteEvents * 25);
  const pasteRatioPercent = Math.round(
    Math.min(100, ((params.pasteEvents * 25) / totalActions) * 100) * 10
  ) / 10;
  const revisionEntropy = Math.round(
    Math.min(99, Math.max(12, (params.editBurstCount / Math.max(1, params.durationSeconds / 20)) * 38)) * 10
  ) / 10;

  const proofId = `vpf-${crypto.randomUUID().slice(0, 10)}`;
  const createdAt = new Date().toISOString();

  const processMetrics = {
    durationSeconds: Math.max(1, Math.round(params.durationSeconds)),
    keystrokeEvents: Math.max(0, Math.round(params.keystrokeEvents)),
    pasteEvents: Math.max(0, Math.round(params.pasteEvents)),
    pasteRatioPercent,
    editBurstCount: Math.max(1, Math.round(params.editBurstCount)),
    revisionEntropy,
    merkleRoot,
    chunkHashes: effectiveChunks.slice(0, 32),
  };

  const payloadCanonical = JSON.stringify({
    proofId,
    version: '1.0',
    documentTitle: params.documentTitle,
    authorLabel: params.authorLabel,
    contentSha256,
    createdAt,
    processMetrics,
  });

  const signature = crypto
    .sign(null, Buffer.from(payloadCanonical, 'utf8'), params.privateKeyPem)
    .toString('base64');

  return {
    proofId,
    version: '1.0',
    documentTitle: params.documentTitle,
    authorLabel: params.authorLabel,
    contentSha256,
    createdAt,
    ed25519PublicKey: params.publicKeyPem,
    signature,
    processMetrics,
    verified: true,
  };
}

export function verifyVeritasProofSignature(
  bundle: VeritasProofBundle,
  rawContentOptional?: string
): {
  validSignature: boolean;
  contentMatch: boolean | null;
  merkleMatch: boolean;
  contentMatchesHash: boolean | null;
  merkleRootValid: boolean;
  reason: string;
} {
  try {
    const payloadCanonical = JSON.stringify({
      proofId: bundle.proofId,
      version: bundle.version,
      documentTitle: bundle.documentTitle,
      authorLabel: bundle.authorLabel,
      contentSha256: bundle.contentSha256,
      createdAt: bundle.createdAt,
      processMetrics: bundle.processMetrics,
    });

    const validSignature = crypto.verify(
      null,
      Buffer.from(payloadCanonical, 'utf8'),
      bundle.ed25519PublicKey,
      Buffer.from(bundle.signature, 'base64')
    );

    const recomputedMerkle = computeMerkleRoot(
      bundle.processMetrics.chunkHashes.length > 0
        ? bundle.processMetrics.chunkHashes
        : [bundle.contentSha256]
    );
    const merkleMatch = recomputedMerkle === bundle.processMetrics.merkleRoot;

    let contentMatch: boolean | null = null;
    if (typeof rawContentOptional === 'string' && rawContentOptional.length > 0) {
      const actualHash = crypto.createHash('sha256').update(rawContentOptional, 'utf8').digest('hex');
      contentMatch = actualHash === bundle.contentSha256;
    }

    const parts: string[] = [];
    parts.push(validSignature ? 'Ed25519 signature valid' : 'Ed25519 signature invalid');
    parts.push(merkleMatch ? 'Merkle root verified' : 'Merkle root mismatch');
    if (contentMatch !== null) {
      parts.push(contentMatch ? 'Raw text matches SHA-256 digest' : 'Raw text does NOT match SHA-256 digest');
    }

    return {
      validSignature,
      contentMatch,
      merkleMatch,
      contentMatchesHash: contentMatch,
      merkleRootValid: merkleMatch,
      reason: parts.join(' · '),
    };
  } catch {
    return {
      validSignature: false,
      contentMatch: null,
      merkleMatch: false,
      contentMatchesHash: null,
      merkleRootValid: false,
      reason: 'Malformed proof bundle or invalid Ed25519 public key.',
    };
  }
}

export function escapeXml(value: string | number): string {
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeFileName(rawName: string): string {
  const withoutNulls = String(rawName || 'upload.bin').replace(/\0/g, '');
  const base = path.posix.basename(withoutNulls.replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\x00-\x1F\x7F<>:"/|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'upload.bin';
  }
  return cleaned.slice(0, 180);
}

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const trimmedLeading = cleaned.replace(/^[\s]+/, '');
  const safeValue =
    /^[=+\-@\t\r]/.test(trimmedLeading) || /^[=+\-@\t\r]/.test(cleaned)
      ? `'${cleaned}`
      : cleaned;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function stripPrototypePollutionKeys<T extends object = Record<string, unknown>>(
  input: unknown
): Partial<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    clean[key] = val;
  }
  return clean as Partial<T>;
}

export function isPrivateOrReservedIp(ipRaw: string): boolean {
  const ip = ipRaw.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice(7);
    if (net.isIPv4(tail)) {
      return isPrivateOrReservedIp(tail);
    }
    const hexParts = tail.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIp(ipv4);
      }
    }
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 127) return true; // Loopback 127.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local / Metadata 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 172.16.0.0/12
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 168) return true; // RFC1918 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark 198.18.0.0/15
    if (a >= 224) return true; // Multicast & Reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.split('%')[0];
    if (normalized === '::' || normalized === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true; // ULA fc00::/7
    if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true; // Link-local fe80::/10
    if (/^ff[0-9a-f]{2}:/i.test(normalized)) return true; // Multicast ff00::/8
    return false;
  }

  return true;
}

const BLOCKED_INTERNAL_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

export async function assertSafeExternalUrl(
  rawUrl: string,
  options: { skipDns?: boolean } = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL syntax.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only public http:// and https:// URLs are permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing embedded credentials are rejected.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    BLOCKED_INTERNAL_HOSTS.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error(`SSRF protection blocked internal or metadata hostname "${host}".`);
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error(`SSRF protection blocked private or reserved IP address "${host}".`);
    }
    return parsed;
  }

  if (!host.includes('.')) {
    throw new Error(`SSRF protection rejected single-label internal hostname "${host}".`);
  }

  if (!options.skipDns) {
    const records = await dns.lookup(host, { all: true }).catch(() => {
      throw new Error(`DNS resolution failed for hostname "${host}".`);
    });
    if (!records || records.length === 0) {
      throw new Error(`No DNS records found for hostname "${host}".`);
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error(
          `SSRF protection blocked hostname "${host}" resolving to private IP "${rec.address}".`
        );
      }
    }
  }

  return parsed;
}

export function validateSafeRegexPattern(pattern: string): { valid: boolean; reason?: string } {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Regex pattern cannot be empty.' };
  }
  if (trimmed.length > 240) {
    return { valid: false, reason: 'Regex pattern exceeds maximum allowed length of 240 characters.' };
  }
  // Reject backreferences which make NFA matching exponential
  if (/\\[1-9]/.test(trimmed)) {
    return { valid: false, reason: 'Backreferences are disallowed in custom regex rules to prevent ReDoS.' };
  }
  // Detect nested quantifiers e.g. (a+)+, (a*)*, ([a-z]+)*, (a|b+)+, (?:foo+)*
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{?]/.test(trimmed)) {
    return { valid: false, reason: 'Nested quantifiers are disallowed to prevent catastrophic ReDoS backtracking.' };
  }
  // Detect repeated groups with alternation containing quantifiers or ambiguous overlaps
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[+*{]/.test(trimmed)) {
    return { valid: false, reason: 'Quantified alternation groups are disallowed to prevent ReDoS.' };
  }
  // Detect adjacent unbounded wildcards
  if (/(?:\.\*|\.\+){2,}/.test(trimmed)) {
    return { valid: false, reason: 'Adjacent unbounded quantifiers are disallowed.' };
  }
  try {
    new RegExp(trimmed, 'gi');
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed regular expression syntax.' };
  }
}

export function buildSelfHostedProofSvgBadge(bundle: VeritasProofBundle): string {
  const shortSig = escapeXml(bundle.signature.slice(0, 12));
  const safeTitle = escapeXml(bundle.documentTitle.slice(0, 32));
  const safeKeys = escapeXml(bundle.processMetrics.keystrokeEvents);
  const safePaste = escapeXml(bundle.processMetrics.pasteRatioPercent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64" viewBox="0 0 320 64" role="img" aria-label="Veritas Cryptographic Proof">
  <rect width="320" height="64" rx="6" fill="#0f172a"/>
  <rect x="1" y="1" width="318" height="62" rx="5" fill="none" stroke="#334155"/>
  <circle cx="26" cy="32" r="10" fill="#059669"/>
  <path d="M21 32l3.5 3.5L31 28.5" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="46" y="26" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="12" font-weight="600">Veritas Proof · ${safeTitle}</text>
  <text x="46" y="44" fill="#94a3b8" font-family="monospace" font-size="10">Ed25519 ${shortSig} · ${safeKeys} keys · ${safePaste}% paste</text>
</svg>`;
}
