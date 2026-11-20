import { describe, expect, it } from 'vitest';
import {
  analyzeDeterministicCodeIdioms,
  compareCodeCorpusOverlap,
  computeAstFingerprint,
  computeCyclomaticComplexity,
  detectCodeLanguage,
  normalizeAstTokenStream,
  scanSpdxLicenseRisks,
} from '../../src/server/codeAnalysis.ts';
import {
  blendAuthorVectors,
  buildAcademicIntegrityReport,
  buildContentQualityDeterministic,
  checkPlagiarismAgainstCorpus,
  compareAuthorDrift,
  computeAuthorVector,
  computeContentAuthenticity,
  computeDeterministicSeo,
  computeGeoAnalysis,
  computeReadabilityAndQuality,
  detectLanguageHeuristic,
  detectParaphraseSpin,
  evaluatePlugins,
  extractInlineCitations,
  mergeSentencesWithModelScores,
  scoreSentenceHeuristic,
  splitSentencesWithOffsets,
} from '../../src/server/stylometry.ts';
import { store } from '../../src/server/store.ts';

describe('Code Analysis & AST Forensics Unit Suite', () => {
  it('detects programming languages automatically and respects overrides', () => {
    expect(detectCodeLanguage('interface User { id: string; }')).toBe('TypeScript');
    expect(detectCodeLanguage('def train_model(x):\n  return x')).toBe('Python');
    expect(detectCodeLanguage('fn main() -> i32 { let mut x = 1; x }')).toBe('Rust');
    expect(detectCodeLanguage('package main\nfunc main() {}')).toBe('Go');
    expect(detectCodeLanguage('SELECT id FROM users WHERE active = 1;')).toBe('SQL');
    expect(detectCodeLanguage('public class App { public static void main(String[] a){} }')).toBe('Java');
    expect(detectCodeLanguage('const add = (a, b) => a + b;')).toBe('JavaScript');
    expect(detectCodeLanguage('const x = 1;', 'Rust')).toBe('Rust');
  });

  it('produces variable-rename-invariant AST fingerprints and detects corpus overlap', () => {
    const codeA = `
      function calculateTotal(items, taxRate) {
        let sum = 0;
        for (const item of items) {
          if (item.price > 0) {
            sum += item.price * (1 + taxRate);
          }
        }
        return sum;
      }
    `;
    const codeB = `
      // Renamed identifiers with identical control flow
      function computeInvoice(records, rate) {
        let total = 0;
        for (const row of records) {
          if (row.price > 0) {
            total += row.price * (1 + rate);
          }
        }
        return total;
      }
    `;

    const tokA = normalizeAstTokenStream(codeA);
    const tokB = normalizeAstTokenStream(codeB);
    expect(computeAstFingerprint(tokA)).toBe(computeAstFingerprint(tokB));
    expect(computeCyclomaticComplexity(codeA)).toBeGreaterThanOrEqual(3);

    const overlap = compareCodeCorpusOverlap(tokB, [
      { id: 'cod-1', title: 'Original Function', normalizedTokens: tokA },
    ]);
    expect(overlap.length).toBe(1);
    expect(overlap[0].structuralSimilarityPercent).toBeGreaterThan(80);
  });

  it('scans SPDX licenses and AI coding idiom scaffolds', () => {
    expect(scanSpdxLicenseRisks('// SPDX-License-Identifier: GPL-3.0')[0].severity).toBe('High');
    expect(scanSpdxLicenseRisks('// AGPL-3.0')[0].licenseId).toBe('AGPL-3.0');
    expect(scanSpdxLicenseRisks('// Apache-2.0')[0].licenseId).toBe('Apache-2.0');
    expect(scanSpdxLicenseRisks('// SPDX-License-Identifier: MIT')[0].licenseId).toBe('MIT');
    expect(scanSpdxLicenseRisks('// Copyright (c) 2026 Acme')[0].severity).toBe('Warning');

    const scaffolded = `
      // Step 1: Initialize config
      // Helper function to fetch records
      // TODO: replace your_api_key_here
      const x = 1;
    `;
    const idioms = analyzeDeterministicCodeIdioms(scaffolded);
    expect(idioms.some((f) => f.includes('comment density'))).toBe(true);
    expect(idioms.some((f) => f.includes('Template scaffold'))).toBe(true);
    expect(idioms.some((f) => f.includes('boilerplate placeholder'))).toBe(true);
  });
});

describe('Stylometry, Readability, GEO/SEO & Authorship Drift Unit Suite', () => {
  it('computes complete readability indices, writing quality, SEO, GEO, and academic integrity', () => {
    const prose = `# What Is Deterministic AI Stylometry?

Deterministic stylometry measures sentence burstiness, type-token diversity, and citation provenance (Gehrmann et al., 2019). According to our 2025 benchmark across 1,420 documents, Flesch-Kincaid metrics remained stable.

- Measures 16 function-word ratios cleanly.
- Evaluates 10.18653/v1/P19-3019 and https://aclanthology.org/P19-3019/ references.`;

    const { readability, writingQuality, wordCount } = computeReadabilityAndQuality(prose);
    expect(wordCount).toBeGreaterThan(40);
    expect(readability.fleschReadingEase).toBeGreaterThanOrEqual(0);
    expect(readability.colemanLiauIndex).toBeGreaterThanOrEqual(0);
    expect(writingQuality.burstiness).toBeGreaterThanOrEqual(0);

    const citations = extractInlineCitations(prose);
    expect(citations.length).toBeGreaterThanOrEqual(3);

    const seo = computeDeterministicSeo(prose, 'Stylometry Guide', 'stylometry');
    expect(seo.targetKeywordCount).toBeGreaterThanOrEqual(2);
    expect(seo.checklist.length).toBe(5);

    const geo = computeGeoAnalysis(prose, 'Stylometry Guide');
    expect(geo.geoScore).toBeGreaterThan(40);
    expect(geo.detectedEntities.length).toBeGreaterThan(0);

    const quality = buildContentQualityDeterministic(prose, writingQuality, readability);
    expect(quality.overallScore).toBeGreaterThan(30);

    const academic = buildAcademicIntegrityReport(prose, 12, 0, readability);
    expect(academic.riskLevel).toBe('Low Risk');

    const auth = computeContentAuthenticity({
      humanProbability: 88,
      plagiarismSimilarity: 0,
      inlineCitationCount: citations.length,
      hasUrlSource: true,
    });
    expect(auth.overallScore).toBeGreaterThan(75);
    expect(auth.grade).toBe('Verified Authentic');
  });

  it('detects languages across Unicode scripts and European token signatures', () => {
    expect(detectLanguageHeuristic('这是一个中文测试文本用于检测。').language).toBe('Chinese');
    expect(detectLanguageHeuristic('これは日本語のテスト文章です。').language).toBe('Japanese');
    expect(detectLanguageHeuristic('이것은 한국어 테스트 문장입니다.').language).toBe('Korean');
    expect(detectLanguageHeuristic('هذا نص عربي للاختبار التحليلي.').language).toBe('Arabic');
    expect(detectLanguageHeuristic('Это русский текст для проверки языка.').language).toBe('Russian');
    expect(detectLanguageHeuristic('यह हिंदी भाषा का एक परीक्षण वाक्य है।').language).toBe('Hindi');
    expect(
      detectLanguageHeuristic('El sistema para la detección con una arquitectura que está lista.').language
    ).toBe('Spanish');
    expect(
      detectLanguageHeuristic('Le modèle pour les données et des résultats dans une analyse.').language
    ).toBe('French');
    expect(
      detectLanguageHeuristic('Die Analyse der Daten und das System mit für die Prüfung.').language
    ).toBe('German');
  });

  it('scores AI clichés vs human contractions and guards plugin regexes against ReDoS', () => {
    const aiSent =
      'Furthermore, organizations must delve into this ever-evolving landscape to streamline multifaceted paradigms.';
    const humanSent = "I remember we couldn't fix the sensor until Tuesday afternoon.";

    const aiRes = scoreSentenceHeuristic(aiSent);
    const humRes = scoreSentenceHeuristic(humanSent);
    expect(aiRes.aiProbability).toBeGreaterThan(humRes.aiProbability + 30);

    const merged = mergeSentencesWithModelScores(splitSentencesWithOffsets(`${aiSent} ${humanSent}`), [
      { index: 0, aiProbability: 92, reason: 'Model flagged cliché' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].label).toBe('AI');

    const plugins = [
      ...store.getPlugins(),
      {
        id: 'plugin-evil-redos',
        name: 'Unsafe ReDoS Rule',
        description: 'Should be skipped safely',
        category: 'Custom Rule' as const,
        enabled: true,
        weight: 20,
        pattern: '(a+)+$',
        isRegex: true,
        createdAt: new Date().toISOString(),
      },
    ];
    const findings = evaluatePlugins(aiSent, plugins, 15);
    const evilFinding = findings.find((f) => f.pluginId === 'plugin-evil-redos');
    expect(evilFinding?.triggered).toBe(false);

    const spin = detectParaphraseSpin(
      'In the realm of innovation, utilize robust synergy to ameliorate multifaceted paradigms cleanly.',
      {
        overall: 60,
        clarity: 60,
        conciseness: 60,
        lexicalRichness: 80,
        structuralVariety: 40,
        burstiness: 22,
        typeTokenRatio: 0.9,
        hapaxRatio: 0.8,
      },
      58
    );
    expect(spin.classification).toBe('AI-Paraphrased / Spun');
  });

  it('checks plagiarism against existing corpus and detects author stylometric drift', () => {
    const sampleDoc = store.getHistory()[0];
    const copiedProse =
      'In this benchmark evaluation, we systematically analyze five key linguistic invariants across distributed editorial pipelines cleanly.';
    const plag = checkPlagiarismAgainstCorpus(copiedProse, [
      { ...sampleDoc, id: 'corpus-ref', fullText: copiedProse },
    ]);
    expect(plag.overallSimilarityPercent).toBe(100);

    const sampleAuthor =
      "Look, we tried three different gaskets on the manifold before noon! Honestly, I didn't expect the brass flange to warp like that — did anyone torque the lower bolts? No wonder pressure bled off.";
    const sampleDiff =
      'Consequently, enterprise architectures facilitate holistic operational optimization across distributed ecosystems. Moreover, standardized pipelines establish continuous reliability across multi-tenant deployments. Additionally, comprehensive governance guarantees alignment.';

    const vecA = computeAuthorVector(sampleAuthor);
    const vecB = computeAuthorVector(sampleDiff);
    const blended = blendAuthorVectors(vecA.vector, 1, vecA.vector);
    expect(blended.avgSentenceLength).toBeCloseTo(vecA.vector.avgSentenceLength, 1);

    const sameDrift = compareAuthorDrift('p1', 'Elena', vecA.vector, vecA.vector);
    const diffDrift = compareAuthorDrift('p1', 'Elena', vecA.vector, vecB.vector);
    expect(sameDrift.matchVerdict).toBe('Consistent Authorship');
    expect(diffDrift.driftScore).toBeGreaterThan(sameDrift.driftScore);
  });
});
