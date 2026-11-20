import JSZip from 'jszip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVeritasApp } from '../../src/server/app.ts';
import * as geminiModule from '../../src/server/gemini.ts';
import { runMediaPipeline, runUrlCrawlPipeline } from '../../src/server/pipeline.ts';
import { store } from '../../src/server/store.ts';

describe('Veritas Full API, Integration, Smoke & Acceptance Suite', () => {
  const app = createVeritasApp({ globalRateLimitRpm: 5000 });
  const initialPrivacy = { ...store.getPrivacyConfig() };
  const createdRecordIds: string[] = [];
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    store.updatePrivacyConfig({ mode: 'local-only', scrubPiiBeforeExternal: true, storeRawText: true });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    for (const id of createdRecordIds) {
      store.deleteRecord(id);
    }
    store.updatePrivacyConfig(initialPrivacy);
    vi.restoreAllMocks();
  });

  it('passes Smoke checks: GET /api/health, /api/openapi.json, /api/v1/lti/config.json', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.status).toBe('ok');
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBe('nosniff');

    const openapi = await request(app).get('/api/openapi.json').expect(200);
    expect(openapi.body.openapi).toBe('3.1.0');
    expect(openapi.body.paths['/api/v1/detect']).toBeDefined();

    const lti = await request(app).get('/api/v1/lti/config.json').expect(200);
    expect(lti.body.privacy_level).toBe('anonymous');
  });

  it('executes full text detection, exclusion filtering, SEO audit, and security inspection', async () => {
    await request(app).post('/api/v1/detect').send({ text: '   ' }).expect(400);
    await request(app).post('/api/v1/fact-check').send({ text: '' }).expect(400);
    await request(app).post('/api/v1/plagiarism-web').send({ text: '' }).expect(400);
    await request(app).post('/api/v1/plagiarism-crosslingual').send({ text: '' }).expect(400);
    await request(app).post('/api/v1/seo-analyze').send({ text: '' }).expect(400);
    await request(app).post('/api/v1/security/inspect').send({ text: '' }).expect(400);
    await request(app).post('/api/v1/exclusions/recalculate').send({ recordId: 'missing' }).expect(404);

    const detectRes = await request(app)
      .post('/api/v1/detect')
      .send({
        title: 'API Integration Test Essay',
        targetKeyword: 'observability',
        text:
          'Furthermore, organizations must delve into cloud observability to streamline distributed architectures.\n\n' +
          'Additionally, comprehensive telemetry plays a crucial role in ensuring seamless integration across workflows.',
      })
      .expect(200);

    createdRecordIds.push(detectRes.body.id);
    expect(detectRes.body.aiProbability).toBeGreaterThan(50);
    expect(detectRes.body.authenticity).toBeDefined();
    expect(detectRes.body.seoAnalysis.targetKeyword).toBe('observability');

    const exclRes = await request(app)
      .post('/api/v1/exclusions/recalculate')
      .send({
        recordId: detectRes.body.id,
        filters: { excludeQuotes: true, excludeBibliography: true, excludeHeaders: true, minMatchWords: 5 },
      })
      .expect(200);
    expect(exclRes.body.adjustedAiProbability).toBeGreaterThan(0);

    const seoRes = await request(app)
      .post('/api/v1/seo-analyze')
      .send({ recordId: detectRes.body.id, targetKeyword: 'telemetry' })
      .expect(200);
    expect(seoRes.body.seoAnalysis.targetKeyword).toBe('telemetry');

    const secRes = await request(app)
      .post('/api/v1/security/inspect')
      .send({ text: 'Check email sec@test.org and zero\u200Bwidth' })
      .expect(200);
    expect(secRes.body.report.zeroWidthCount).toBe(1);
    expect(secRes.body.redactionCount).toBe(1);
  });

  it('runs Code Forensics, Author Stylometric Twin, and Ed25519 Veritas Proofs end-to-end', async () => {
    await request(app).post('/api/v1/analyze-code').send({ code: '' }).expect(400);
    const codeRes = await request(app)
      .post('/api/v1/analyze-code')
      .send({
        title: 'Rate Limiter Middleware',
        language: 'TypeScript',
        code: '// SPDX-License-Identifier: MIT\n// Step 1: Initialize limiter\nexport function allow(n: number) { if (n > 0) return true; return false; }',
      })
      .expect(200);
    expect(codeRes.body.astFingerprint).toHaveLength(16);

    const codeList = await request(app).get('/api/v1/code-reports').expect(200);
    expect(codeList.body.length).toBeGreaterThanOrEqual(1);

    await request(app).post('/api/v1/authorship/profiles').send({ sampleText: 'too short' }).expect(400);
    await request(app)
      .post('/api/v1/authorship/profiles')
      .send({ sampleText: 'word '.repeat(30) })
      .expect(400);

    const baselineText =
      "We wired the test rig in the basement lab because the upstairs bench shook every time the freight elevator moved. After three tries I swapped the braided copper strap for a shorter jumper, and honestly the jitter dropped right away! Did anyone log yesterday's voltage drift yet?";
    const profRes = await request(app)
      .post('/api/v1/authorship/profiles')
      .send({ authorName: 'Marcus Vance', departmentOrRole: 'Hardware QA', sampleText: baselineText })
      .expect(201);
    const createdProfileId = profRes.body.id;

    await request(app).get('/api/v1/authorship/profiles').expect(200);
    await request(app)
      .post('/api/v1/authorship/profiles')
      .send({ profileId: createdProfileId, sampleText: baselineText })
      .expect(200);

    await request(app).post('/api/v1/authorship/verify').send({ profileId: 'missing', text: baselineText }).expect(404);
    await request(app)
      .post('/api/v1/authorship/verify')
      .send({ profileId: createdProfileId, text: 'too short' })
      .expect(400);

    const driftRes = await request(app)
      .post('/api/v1/authorship/verify')
      .send({ profileId: createdProfileId, text: baselineText })
      .expect(200);
    expect(driftRes.body.matchVerdict).toBe('Consistent Authorship');

    await request(app).delete(`/api/v1/authorship/profiles/${createdProfileId}`).expect(200);
    await request(app).delete(`/api/v1/authorship/profiles/${createdProfileId}`).expect(404);

    await request(app).post('/api/v1/proofs/create').send({ content: '' }).expect(400);
    await request(app).post('/api/v1/proofs/verify').send({}).expect(400);

    const proofRes = await request(app)
      .post('/api/v1/proofs/create')
      .send({
        documentTitle: 'Verified Field Report',
        authorLabel: 'Marcus Vance',
        content: baselineText,
        durationSeconds: 95,
        keystrokeEvents: 270,
        pasteEvents: 0,
        editBurstCount: 6,
      })
      .expect(201);

    await request(app).get('/api/v1/proofs').expect(200);
    const verifyRes = await request(app)
      .post('/api/v1/proofs/verify')
      .send({ bundle: proofRes.body, rawContent: baselineText })
      .expect(200);
    expect(verifyRes.body.validSignature).toBe(true);

    const binaryParser = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    const svgRes = await request(app)
      .get(`/api/v1/proofs/${proofRes.body.proofId}/badge.svg`)
      .parse(binaryParser)
      .expect(200);
    expect(svgRes.headers['content-security-policy']).toContain('sandbox');
    expect((svgRes.body as Buffer).toString('utf8')).toContain('Verified Field Report');
    await request(app).get('/api/v1/proofs/vpf-missing/badge.svg').expect(404);
  });

  it('supports MCP JSON-RPC, Citations Vault, Uploads, Batch Queue + SSE, History & Exports (DOCX/ZIP)', async () => {
    const mcpList = await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(200);
    expect(mcpList.body.result.tools.length).toBe(3);

    await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'veritas_check_security', arguments: { text: 'a@b.com' } } })
      .expect(200);

    const pBundle = (await request(app).get('/api/v1/proofs')).body[0];
    await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'veritas_verify_proof', arguments: { bundle: pBundle } } })
      .expect(200);

    const mcpDetect = await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'veritas_detect_text', arguments: { text: 'Transformer manual calibration text.' } } })
      .expect(200);
    expect(mcpDetect.body.result.verdict).toBeDefined();

    const mcpUnknown = await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'unknown_tool' } })
      .expect(200);
    expect(mcpUnknown.body.error.code).toBe(-32601);

    const mcpErr = await request(app)
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'veritas_detect_text', arguments: { text: '' } } })
      .expect(200);
    expect(mcpErr.body.error.code).toBe(-32000);

    const mcpBadMethod = await request(app).post('/api/v1/mcp').send({ id: 7, method: 'ping' }).expect(200);
    expect(mcpBadMethod.body.error.code).toBe(-32601);

    await request(app).get('/api/v1/citations').expect(200);
    await request(app).post('/api/v1/citations').send({}).expect(400);
    const citRes = await request(app)
      .post('/api/v1/citations')
      .send({ title: 'Open Forensics Standard', authors: ['A. Turing'], year: '2025', url: 'https://arxiv.org/abs/2301.11305', sourceType: 'Report' })
      .expect(201);
    await request(app).delete(`/api/v1/citations/${citRes.body.id}`).expect(200);
    await request(app).delete('/api/v1/citations/missing').expect(404);

    // Media upload & errors
    await request(app).post('/api/v1/analyze-media').expect(400);
    const uploadRes = await request(app)
      .post('/api/v1/analyze-media')
      .attach('file', Buffer.from('I went back to the bench and calibrated the flow valve carefully.'), 'notes.txt')
      .expect(200);
    createdRecordIds.push(uploadRes.body.id);

    await request(app).post('/api/v1/detect/batch').expect(400);
    const batchRes = await request(app)
      .post('/api/v1/detect/batch')
      .attach('files', Buffer.from('Batch item one written manually during field testing.'), 'batch1.txt')
      .attach('files', Buffer.from(''), 'empty.txt')
      .expect(202);

    await request(app).get('/api/v1/jobs').expect(200);
    await request(app).get('/api/v1/jobs/missing').expect(404);
    await request(app).get('/api/v1/jobs/missing/stream').expect(404);

    let jobStatus = batchRes.body.status;
    for (let i = 0; i < 15 && jobStatus !== 'completed' && jobStatus !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 35));
      const jRes = await request(app).get(`/api/v1/jobs/${batchRes.body.id}`).expect(200);
      jobStatus = jRes.body.status;
      if (jRes.body.resultRecordIds?.length) {
        for (const rid of jRes.body.resultRecordIds) createdRecordIds.push(rid);
      }
    }
    expect(jobStatus).toBe('completed');

    // SSE stream returns final completed state cleanly and closes
    const sseRes = await request(app).get(`/api/v1/jobs/${batchRes.body.id}/stream`).expect(200);
    expect(sseRes.text).toContain('data:');

    // History CRUD & comments
    const targetRec = store.getHistory()[0];
    await request(app).post(`/api/v1/history/${targetRec.id}/comments`).send({ text: '' }).expect(400);
    await request(app).post('/api/v1/history/missing/comments').send({ text: 'ok' }).expect(404);
    await request(app).post(`/api/v1/history/${targetRec.id}/comments`).send({ text: 'Verified by QA Lead' }).expect(200);

    // Enrich record with factCheck + humanizedVersions for full DOCX export coverage
    const richRecord = {
      ...targetRec,
      factCheck: {
        checkedAt: new Date().toISOString(),
        overallVeracityScore: 92,
        verifiedCount: 1,
        disputedCount: 0,
        unverifiedCount: 0,
        summary: 'Grounded summary.',
        claims: [{ id: 'c1', claim: 'Water boils at 100C', status: 'Verified' as const, confidence: 98, explanation: 'Standard physics.', sources: [] }],
        groundingSources: [],
      },
      humanizedVersions: [{
        id: 'h1',
        createdAt: new Date().toISOString(),
        intensity: 'moderate' as const,
        originalText: 'Orig',
        humanizedText: 'Natural humanized prose paragraph.',
        originalAiScore: 85,
        recheckAiScore: 18,
        recheckVerdict: 'Human' as const,
        preservedFactsNotes: [],
        changesSummary: 'Rewritten',
      }],
    };

    const binaryParser = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    await request(app).post('/api/v1/export/docx').send({}).expect(400);
    const docxFull = await request(app).post('/api/v1/export/docx').send({ record: richRecord }).parse(binaryParser).expect(200);
    expect((docxFull.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');

    const docxHum = await request(app).post('/api/v1/export/docx').send({ record: richRecord, humanizedOnly: true }).parse(binaryParser).expect(200);
    expect((docxHum.body as Buffer).subarray(0, 2).toString('ascii')).toBe('PK');

    await request(app).post('/api/v1/export/bulk').send({ recordIds: ['missing-id'] }).expect(400);
    const bulkRes = await request(app).post('/api/v1/export/bulk').send({ recordIds: [targetRec.id] }).parse(binaryParser).expect(200);
    const zip = await JSZip.loadAsync(bulkRes.body as Buffer);
    expect(await zip.file('summary.csv')?.async('string')).toContain(targetRec.id);

    // Delete newly created detection record
    await request(app).delete(`/api/v1/history/${uploadRes.body.id}`).expect(200);
    await request(app).delete('/api/v1/history/missing').expect(404);
  });

  it('exercises mocked Gemini external pipelines: media image/audio/video, URL crawl, humanize, fact-check, web/cross-lingual plagiarism, citation entailment & lookup', async () => {
    store.updatePrivacyConfig({ mode: 'hybrid-airlock', scrubPiiBeforeExternal: true, storeRawText: true });

    vi.spyOn(geminiModule, 'analyzeTextWithGemini').mockResolvedValue({
      overallAiProbability: 24,
      confidence: 88,
      suspectedModelFamily: 'Human Authored',
      detectedLanguage: 'English',
      summary: 'Organic cadence.',
      sentenceScores: [{ index: 0, aiProbability: 22, reason: 'Natural' }],
      contentCritique: { detectedTone: 'Technical', strengths: ['Clear'], recommendations: ['Keep'] },
    });
    vi.spyOn(geminiModule, 'humanizeTextWithGemini').mockResolvedValue({
      humanizedText: 'We adjusted the pipeline cadence so every section reads naturally.',
      preservedFactsNotes: ['Preserved metrics'],
      changesSummary: 'Rewrote transitions.',
    });
    vi.spyOn(geminiModule, 'factCheckAndVerifySourcesWithGemini').mockResolvedValue({
      checkedAt: new Date().toISOString(),
      overallVeracityScore: 95,
      verifiedCount: 1,
      disputedCount: 0,
      unverifiedCount: 0,
      summary: 'Verified.',
      claims: [],
      groundingSources: [],
    });
    vi.spyOn(geminiModule, 'checkWebPlagiarismWithGemini').mockResolvedValue({
      webMatches: [{ url: 'https://example.org', title: 'Example', matchedExcerpt: 'sample match', similarityNote: 'Overlap' }],
    });
    vi.spyOn(geminiModule, 'checkCrossLingualPlagiarismWithGemini').mockResolvedValue([
      { sourceUrl: 'https://es.example.org', sourceTitle: 'Articulo', sourceLanguage: 'Spanish', matchedOriginalExcerpt: 'texto', translatedMatchExcerpt: 'text', similarityNote: 'Translated match' },
    ]);
    vi.spyOn(geminiModule, 'verifyCitationEntailmentWithGemini').mockResolvedValue({
      claim: 'Sample claim',
      citationUrl: 'https://93.184.216.34/paper',
      status: 'Supported',
      confidence: 91,
      rationale: 'Supported directly.',
      matchedEvidenceQuote: 'Exact quote.',
      sourceTitle: 'Paper',
    });
    vi.spyOn(geminiModule, 'lookupCitationWithGemini').mockResolvedValue({
      title: 'Attention Is All You Need',
      authors: ['Vaswani et al.'],
      year: '2017',
      publisherOrJournal: 'NeurIPS',
      sourceType: 'Journal Article',
      verificationStatus: 'Verified Source',
    });
    vi.spyOn(geminiModule, 'inspectImageWithGemini').mockResolvedValue({
      ocrText: 'Extracted image OCR paragraph covering system benchmark data.',
      syntheticProbability: 81,
      suspectedGenerator: 'Midjourney v6',
      summary: 'High likelihood of diffusion synthesis.',
      deepfakeIndicators: [{ category: 'Texture', severity: 'High', detail: 'Skin smoothing artifacts' }],
    });
    vi.spyOn(geminiModule, 'transcribeAudioWithGemini').mockResolvedValue(
      'Spoken laboratory audio transcript describing valve calibration.'
    );
    vi.spyOn(geminiModule, 'inspectVideoWithGemini').mockResolvedValue({
      transcript: 'Video speaker transcript verifying studio experiment parameters.',
      syntheticProbability: 74,
      frameConsistencyScore: 68,
      audioSyncAssessment: 'Minor 80ms lip-sync drift',
      suspectedGenerator: 'Sora / Diffusion Video',
      summary: 'Temporal flickering along hairline.',
      deepfakeIndicators: [{ category: 'Temporal', severity: 'Medium', detail: 'Frame flicker' }],
    });
    vi.spyOn(geminiModule, 'inspectCodeWithGemini').mockResolvedValue({
      aiCodeProbability: 76,
      confidence: 85,
      suspectedAssistant: 'Copilot / LLM',
      summary: 'Instructional scaffolding comments.',
      llmIdiomFindings: ['Uniform naming'],
      securityNotes: ['No unsafe sinks'],
    });

    const targetId = store.getHistory()[0].id;
    await request(app).post('/api/v1/detect').send({ text: 'Hybrid airlock pipeline verification prose sentence.' }).expect(200).then((r) => createdRecordIds.push(r.body.id));
    await request(app).post('/api/v1/humanize').send({ text: 'Furthermore, utilize robust tools.', intensity: 'light', recordId: targetId }).expect(200);
    await request(app).post('/api/v1/humanize').send({ text: '' }).expect(400);

    const fc = await request(app).post('/api/v1/fact-check').send({ recordId: targetId }).expect(200);
    expect(fc.body.factCheck.overallVeracityScore).toBe(95);

    const webPlag = await request(app).post('/api/v1/plagiarism-web').send({ recordId: targetId }).expect(200);
    expect(webPlag.body.webMatches.length).toBe(1);

    const clPlag = await request(app).post('/api/v1/plagiarism-crosslingual').send({ recordId: targetId }).expect(200);
    expect(clPlag.body.matches.length).toBe(1);

    await request(app).post('/api/v1/citations/entailment').send({ claim: '' }).expect(400);
    const ent = await request(app).post('/api/v1/citations/entailment').send({ claim: 'Sample claim', citationUrl: 'https://93.184.216.34/paper' }).expect(200);
    expect(ent.body.status).toBe('Supported');

    await request(app).post('/api/v1/citations/lookup').send({ query: '' }).expect(400);
    const look = await request(app).post('/api/v1/citations/lookup').send({ query: 'Attention Is All You Need' }).expect(200);
    expect(look.body.year).toBe('2017');

    await request(app).post('/api/v1/analyze-code').send({ code: 'export const x = (a: number) => a * 2;' }).expect(200);

    // Media pipelines: image (PNG), audio (MP3), video (MP4)
    const minPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0, 0, 0, 0]);
    const imgRec = await runMediaPipeline(minPng, 'synth.png', 'image/png');
    createdRecordIds.push(imgRec.id);
    expect(imgRec.mediaForensics?.mediaType).toBe('image');

    const audRec = await runMediaPipeline(Buffer.from('ID3fakeaudiodata'), 'clip.mp3', 'audio/mpeg');
    createdRecordIds.push(audRec.id);
    expect(audRec.mediaForensics?.mediaType).toBe('audio');

    const vidRec = await runMediaPipeline(Buffer.from('ftypmp42fakevideo'), 'clip.mp4', 'video/mp4');
    createdRecordIds.push(vidRec.id);
    expect(vidRec.mediaForensics?.mediaType).toBe('video');

    // URL crawl pipeline
    globalThis.fetch = vi.fn(async () =>
      new Response(
        '<html><head><title>Crawled Research Note</title></head><body><article><p>Empirical evaluation of transformer watermark detection across multilingual benchmarks.</p></article></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      )
    ) as typeof fetch;
    const crawlOut = await runUrlCrawlPipeline('https://93.184.216.34/research', 1);
    expect(crawlOut.pages).toHaveLength(1);
    createdRecordIds.push(crawlOut.pages[0].id);

    await request(app).post('/api/v1/analyze-url').send({ url: '' }).expect(400);
    await request(app).post('/api/v1/analyze-url').send({ url: 'https://93.184.216.34/research', maxPages: 1 }).expect(200).then((r) => {
      for (const p of r.body.pages) createdRecordIds.push(p.id);
    });
  });

  it('covers Admin CRUD, Privacy Config, Local-Only Guard Errors, and User Deletion', async () => {
    // Check privacy-config GET & PUT
    const prev = await request(app).get('/api/v1/privacy-config').expect(200);
    await request(app).put('/api/v1/privacy-config').send({ mode: 'local-only', scrubPiiBeforeExternal: true, storeRawText: false }).expect(200);

    // Local-only blocks external web lookups cleanly (returns 500 error)
    await request(app).post('/api/v1/fact-check').send({ text: 'test claim' }).expect(500);
    await request(app).post('/api/v1/plagiarism-web').send({ text: 'test passage' }).expect(500);
    await request(app).post('/api/v1/plagiarism-crosslingual').send({ text: 'test passage' }).expect(500);
    await request(app).post('/api/v1/citations/entailment').send({ claim: 'c', citationUrl: 'https://93.184.216.34/x' }).expect(500);

    // Keys CRUD + 404s + 200 PATCH
    const k = await request(app).post('/api/v1/keys').send({ name: 'Temp Key', rateLimitRpm: 150, role: 'Researcher' }).expect(201);
    await request(app).get('/api/v1/keys').expect(200);
    await request(app).patch(`/api/v1/keys/${k.body.record.id}`).send({ active: false, rateLimitRpm: 200 }).expect(200);
    await request(app).patch('/api/v1/keys/missing').send({ active: false }).expect(404);
    await request(app).delete(`/api/v1/keys/${k.body.record.id}`).expect(200);
    await request(app).delete(`/api/v1/keys/${k.body.record.id}`).expect(404);

    // Plugins CRUD + 404s
    await request(app).post('/api/v1/plugins').send({ name: '' }).expect(400);
    await request(app).post('/api/v1/plugins').send({ name: 'Bad Regex', pattern: '(a+)+', isRegex: true }).expect(400);
    const pl = await request(app).post('/api/v1/plugins').send({ name: 'Rule X', pattern: 'foo, bar', isRegex: false }).expect(201);
    await request(app).get('/api/v1/plugins').expect(200);
    await request(app).patch(`/api/v1/plugins/${pl.body.id}`).send({ enabled: false, pattern: '\\btest\\b', isRegex: true }).expect(200);
    await request(app).patch(`/api/v1/plugins/${pl.body.id}`).send({ pattern: '(a+)+', isRegex: true }).expect(400);
    await request(app).patch('/api/v1/plugins/missing').send({ enabled: false }).expect(404);
    await request(app).delete(`/api/v1/plugins/${pl.body.id}`).expect(200);
    await request(app).delete(`/api/v1/plugins/${pl.body.id}`).expect(404);

    // Users CRUD + PATCH 200 + DELETE + GDPR erasure 200/400/404
    await request(app).get('/api/v1/users').expect(200);
    await request(app).post('/api/v1/users').send({ name: 'Bad', email: 'not-email' }).expect(400);
    await request(app).post('/api/v1/users').send({ name: 'BadRole', email: 'a@b.co', role: 'Root' }).expect(400);
    const u1 = await request(app).post('/api/v1/users').send({ name: 'Del User', email: 'del@veritas.local', role: 'Reviewer' }).expect(201);
    await request(app).patch(`/api/v1/users/${u1.body.id}`).send({ role: 'Researcher' }).expect(200);
    await request(app).patch(`/api/v1/users/${u1.body.id}`).send({ role: 'Superuser' }).expect(400);
    await request(app).patch('/api/v1/users/missing').send({ active: false }).expect(404);
    await request(app).delete(`/api/v1/users/${u1.body.id}`).expect(200);
    await request(app).delete(`/api/v1/users/${u1.body.id}`).expect(404);

    const u2 = await request(app).post('/api/v1/users').send({ name: 'Erase Subject', email: 'erase@veritas.local', role: 'Reviewer' }).expect(201);
    await request(app).post('/api/v1/privacy/erasure').send({}).expect(400);
    await request(app).post('/api/v1/privacy/erasure').send({ userId: 'missing' }).expect(404);
    const eraseRes = await request(app).post('/api/v1/privacy/erasure').send({ userId: u2.body.id }).expect(200);
    expect(eraseRes.body.deleted).toBe(true);

    // Security 400 mappings on SSRF & invalid magic upload & invalid citation URL
    await request(app).post('/api/v1/analyze-url').send({ url: 'http://127.0.0.1:3000/internal' }).expect(400);
    await request(app).post('/api/v1/citations').send({ title: 'Bad Link', url: 'javascript:alert(1)' }).expect(400);
    await request(app).post('/api/v1/analyze-media').attach('file', Buffer.from('NOT_A_PNG'), 'bad.png').expect(400);

    // Bulk export defaulting to all records
    const bulkAll = await request(app).post('/api/v1/export/bulk').send({}).expect(200);
    expect(bulkAll.headers['content-type']).toContain('application/zip');

    // Malformed JSON error handler
    const badJson = await request(app)
      .post('/api/v1/detect')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(badJson.body.error).toContain('Malformed JSON');

    // Mixed valid + invalid binary inside batch queue (covers per-file failure branch)
    const mixedBatch = await request(app)
      .post('/api/v1/detect/batch')
      .attach('files', Buffer.from('Valid document text inside mixed batch run.'), 'good.txt')
      .attach('files', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]), 'malware.pdf')
      .expect(202);
    // Immediately attach SSE stream to exercise real-time completion emission
    const liveSse = await request(app).get(`/api/v1/jobs/${mixedBatch.body.id}/stream`).expect(200);
    expect(liveSse.text).toContain('completed');
    const mixedJob = (await request(app).get(`/api/v1/jobs/${mixedBatch.body.id}`).expect(200)).body;
    expect(mixedJob.failedItems).toBe(1);
    for (const rid of mixedJob.resultRecordIds || []) createdRecordIds.push(rid);

    // Strict Auth & RBAC middleware paths
    const strictApp = createVeritasApp({ strictAuth: true, globalRateLimitRpm: 500 });
    await request(strictApp).get('/api/v1/keys').expect(401);
    await request(strictApp).get('/api/v1/keys').set('Authorization', 'Bearer vrt_invalid_token').expect(401);

    const reviewerKey = store.createApiKey('Strict Reviewer', 3, 'Reviewer');
    await request(strictApp)
      .get('/api/v1/keys')
      .set('Authorization', `Bearer ${reviewerKey.rawKey}`)
      .expect(403);
    await request(strictApp)
      .post('/api/v1/security/inspect')
      .set('Authorization', `Bearer ${reviewerKey.rawKey}`)
      .send({ text: 'First allowed call' })
      .expect(200);
    await request(strictApp)
      .post('/api/v1/security/inspect')
      .set('Authorization', `Bearer ${reviewerKey.rawKey}`)
      .send({ text: 'Second allowed call' })
      .expect(200);
    await request(strictApp)
      .post('/api/v1/security/inspect')
      .set('Authorization', `Bearer ${reviewerKey.rawKey}`)
      .send({ text: 'Fourth rate-limited call' })
      .expect(429);
    store.updateApiKey(reviewerKey.record.id, { active: false });
    await request(strictApp)
      .post('/api/v1/security/inspect')
      .set('Authorization', `Bearer ${reviewerKey.rawKey}`)
      .send({ text: 'Disabled token' })
      .expect(403);
    store.deleteApiKey(reviewerKey.record.id);

    // Ad-hoc humanize without recordId (covers preCheck pipeline branch) + intensity variations
    const adHocHum = await request(app)
      .post('/api/v1/humanize')
      .send({ text: 'Furthermore, organizations delve into comprehensive systems.', intensity: 'aggressive' })
      .expect(200);
    expect(adHocHum.body.recheckAiScore).toBeDefined();

    // Direct text fact-check, web plagiarism, cross-lingual plagiarism, and SEO audit (without recordId)
    await request(app).put('/api/v1/privacy-config').send({ mode: 'hybrid-airlock', scrubPiiBeforeExternal: true, storeRawText: true }).expect(200);
    await request(app).post('/api/v1/fact-check').send({ text: 'Water freezes at zero degrees Celsius.' }).expect(200);
    await request(app).post('/api/v1/plagiarism-web').send({ text: 'Sample academic passage text.' }).expect(200);
    await request(app).post('/api/v1/plagiarism-crosslingual').send({ text: 'Sample translated passage.' }).expect(200);
    const adHocSeo = await request(app).post('/api/v1/seo-analyze').send({ text: 'Telemetry systems monitor latency in distributed servers.', targetKeyword: 'telemetry' }).expect(200);
    expect(adHocSeo.body.seoAnalysis.targetKeyword).toBe('telemetry');

    // Gemini error propagates safely as 500 JSON without crashing, then Python local analysis returns 200
    vi.spyOn(geminiModule, 'inspectCodeWithGemini').mockRejectedValueOnce(new Error('Gemini offline'));
    const errCode = await request(app)
      .post('/api/v1/analyze-code')
      .send({ title: 'Python Worker', language: 'Python', code: 'def worker(x):\n    return x * 2\n' })
      .expect(500);
    expect(errCode.body.error).toContain('Gemini offline');

    await request(app).put('/api/v1/privacy-config').send({ mode: 'local-only', scrubPiiBeforeExternal: true, storeRawText: true }).expect(200);
    const localCode = await request(app)
      .post('/api/v1/analyze-code')
      .send({ title: 'Python Worker', language: 'Python', code: 'def worker(x):\n    return x * 2\n' })
      .expect(200);
    expect(localCode.body.astFingerprint).toHaveLength(16);

    // Admin strictAuth key deleting a temporary detection record & Multer limit handler check
    const adminKey = store.createApiKey('Strict Admin', 100, 'Admin');
    const tmpDet = await request(strictApp)
      .post('/api/v1/detect')
      .set('Authorization', `Bearer ${adminKey.rawKey}`)
      .send({ text: 'Temporary detection record for strict admin delete check.' })
      .expect(200);
    await request(strictApp)
      .delete(`/api/v1/history/${tmpDet.body.id}`)
      .set('Authorization', `Bearer ${adminKey.rawKey}`)
      .expect(200);
    store.deleteApiKey(adminKey.record.id);

    // Non-multipart / wrong field triggers Multer Unexpected field -> global 500 handler safely
    const wrongField = await request(app)
      .post('/api/v1/analyze-media')
      .attach('wrongField', Buffer.from('abc'), 'a.txt')
      .expect(500);
    expect(wrongField.body.error).toBeDefined();

    await request(app).get('/api/v1/analytics').expect(200);
    await request(app).get('/api/v1/audit-logs').expect(200);
    await request(app).put('/api/v1/privacy-config').send(prev.body).expect(200);
  });
});
