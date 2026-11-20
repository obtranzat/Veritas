import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aiRouter,
  classifyProviderFailure,
  extractHttpStatusFromError,
} from '../../src/server/aiRouter.ts';
import * as geminiModule from '../../src/server/gemini.ts';
import { splitSentencesWithOffsets } from '../../src/server/stylometry.ts';

describe('Resilient Multi-Provider AI Router & Zero-Downtime Failover', () => {
  const originalFetch = globalThis.fetch;
  const envBackup = { ...process.env };

  beforeEach(() => {
    aiRouter.resetForTesting();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    globalThis.fetch = originalFetch;
    aiRouter.resetForTesting();
    vi.restoreAllMocks();
  });

  it('classifies all billing, quota, rate-limit, and outage errors accurately', () => {
    expect(extractHttpStatusFromError({ statusCode: 402 })).toBe(402);
    expect(extractHttpStatusFromError({ response: { status: 429 } })).toBe(429);
    expect(extractHttpStatusFromError(new Error('Upstream HTTP 503 outage'))).toBe(503);
    expect(extractHttpStatusFromError(null)).toBeUndefined();

    expect(classifyProviderFailure(new Error('HTTP 402 Payment Required')).reason).toBe(
      'PAYMENT_REQUIRED_402'
    );
    expect(classifyProviderFailure(new Error('billing_disabled on project')).reason).toBe(
      'BILLING_DISABLED'
    );
    expect(classifyProviderFailure(new Error('INSUFFICIENT_CREDITS remaining')).reason).toBe(
      'INSUFFICIENT_CREDITS'
    );
    expect(classifyProviderFailure(new Error('QUOTA_EXCEEDED for monthly tier')).reason).toBe(
      'QUOTA_EXCEEDED'
    );
    expect(classifyProviderFailure(new Error('RESOURCE_EXHAUSTED: tokens/min')).reason).toBe(
      'RESOURCE_EXHAUSTED'
    );
    expect(classifyProviderFailure(new Error('RATE_LIMIT_EXCEEDED'), 429).reason).toBe(
      'RATE_LIMIT_EXCEEDED'
    );
    expect(classifyProviderFailure(new Error('fetch failed ECONNREFUSED')).reason).toBe('OFFLINE');
    expect(classifyProviderFailure(new Error('socket reset temporarily')).reason).toBe(
      'TRANSIENT_ERROR'
    );
  });

  it('enforces the exact 11-tier provider hierarchy and intelligent routing strategies', () => {
    const telemetry = aiRouter.getTelemetry();
    expect(telemetry.providers.map((p) => p.id)).toEqual([
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
    ]);

    // Configure Ollama + OpenRouter + Gemini + Groq + Anthropic
    aiRouter.updateProvider('ollama', {
      configured: true,
      enabled: true,
      health: 'healthy',
      costPer1kTokensUsd: 0,
      avgLatencyMs: 220,
      qualityScore: 86,
    });
    aiRouter.updateProvider('openrouter', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 15,
    });
    aiRouter.updateProvider('gemini', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 30,
    });
    aiRouter.updateProvider('groq', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 20,
      avgLatencyMs: 85,
    });
    aiRouter.updateProvider('anthropic', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 25,
      qualityScore: 99,
    });

    aiRouter.updatePolicy({ strategy: 'local-first' });
    const localChain = aiRouter.selectCandidateChain({
      allowCloud: true,
      preferExternalFirst: true,
    });
    expect(localChain[0].id).toBe('ollama');
    expect(localChain[localChain.length - 1].id).toBe('local-oss');

    aiRouter.updatePolicy({ strategy: 'cheapest' });
    const cheapestChain = aiRouter.selectCandidateChain({ allowCloud: true });
    expect(cheapestChain[0].id).toBe('ollama');
    expect(cheapestChain[1].id).toBe('openrouter');

    aiRouter.updatePolicy({ strategy: 'fastest' });
    const fastestChain = aiRouter.selectCandidateChain({ allowCloud: true });
    expect(fastestChain[0].id).toBe('groq');

    aiRouter.updatePolicy({ strategy: 'highest-quality' });
    const qualityChain = aiRouter.selectCandidateChain({ allowCloud: true });
    expect(qualityChain[0].id).toBe('anthropic');
  });

  it('aligns local OSS model families (llama, qwen, deepseek, mistral, gemma) across local servers and executes Ollama/vLLM/Anthropic/OpenAI-compatible providers', async () => {
    for (const family of ['qwen', 'deepseek', 'mistral', 'gemma', 'llama'] as const) {
      const updatedPolicy = aiRouter.updatePolicy({
        preferredLocalFamily: family,
        enableResponseCache: false,
      });
      expect(updatedPolicy.preferredLocalFamily).toBe(family);
      const t = aiRouter.getTelemetry();
      const ollama = t.providers.find((p) => p.id === 'ollama')!;
      const vllm = t.providers.find((p) => p.id === 'vllm')!;
      expect(ollama.activeModel.toLowerCase()).toContain(family);
      expect(vllm.activeModel.toLowerCase()).toContain(family);
    }

    // 1. Ollama (/api/chat) succeeds first when configured
    aiRouter.updateProvider('ollama', {
      configured: true,
      enabled: true,
      health: 'healthy',
      endpoint: 'http://127.0.0.1:11434',
    });
    aiRouter.updateProvider('anthropic', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 10,
    });
    aiRouter.updateProvider('openrouter', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditBalanceUsd: 10,
    });

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const sUrl = String(url);
      if (sUrl.includes('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                overallAiProbability: 19,
                confidence: 89,
                suspectedModelFamily: 'Human Authored (Ollama Llama)',
                detectedLanguage: 'English',
                summary: 'Evaluated locally via Ollama.',
                sentenceScores: [{ index: 0, aiProbability: 19, reason: 'Natural' }],
                contentCritique: {
                  detectedTone: 'Conversational',
                  strengths: ['Direct'],
                  recommendations: ['None'],
                },
              }),
            },
          }),
          { status: 200 }
        );
      }
      if (sUrl.includes('/v1/messages')) {
        return new Response(
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  humanizedText: 'Anthropic rewrote this sentence concisely.',
                  preservedFactsNotes: ['All metrics kept'],
                  changesSummary: 'Tightened phrasing',
                }),
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (sUrl.includes('openrouter.ai')) {
        return new Response('{"error":{"message":"INSUFFICIENT_CREDITS"}}', { status: 402 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const text = 'We walked across the lab floor before powering up the local cluster.';
    const detOut = await aiRouter.executeTextDetection({
      text,
      sentences: splitSentencesWithOffsets(text),
    });
    expect(detOut.meta.providerUsed).toBe('ollama');
    expect(detOut.value.overallAiProbability).toBe(19);

    // Disable Ollama so external OpenRouter fails 402 -> fails over to Anthropic (/v1/messages)
    aiRouter.updateProvider('ollama', { enabled: false });
    aiRouter.updatePolicy({ strategy: 'highest-quality' });
    const humOut = await aiRouter.executeHumanize({
      text: 'Furthermore, organizations leverage artificial intelligence daily.',
      intensity: 'moderate',
    });
    expect(humOut.meta.providerUsed).toBe('anthropic');
    expect(humOut.value.humanizedText).toContain('Anthropic rewrote');
  });

  it('cascades seamlessly across all 6 failure triggers without downtime and alerts admins', async () => {
    aiRouter.updatePolicy({
      strategy: 'local-first',
      enableResponseCache: true,
      retryMaxAttempts: 2,
    });

    // Enable cloud chain: OpenRouter (402), Gemini (RESOURCE_EXHAUSTED), OpenAI (BILLING_DISABLED), Groq (429 RATE_LIMIT) -> local-oss
    for (const id of ['openrouter', 'gemini', 'openai', 'groq'] as const) {
      aiRouter.updateProvider(id, {
        configured: true,
        enabled: true,
        health: 'healthy',
        creditBalanceUsd: 10,
      });
    }

    let transientTries = 0;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const sUrl = String(url);
      if (sUrl.includes('openrouter.ai')) {
        return new Response('402 Payment Required', { status: 402 });
      }
      if (sUrl.includes('openai.com')) {
        transientTries++;
        if (transientTries === 1) {
          return new Response('temporary 503 glitch', { status: 503 });
        }
        return new Response('BILLING_DISABLED on organization', { status: 403 });
      }
      if (sUrl.includes('groq.com')) {
        return new Response('RATE_LIMIT_EXCEEDED', { status: 429 });
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

    vi.spyOn(geminiModule, 'factCheckAndVerifySourcesWithGemini').mockRejectedValueOnce(
      new Error('RESOURCE_EXHAUSTED: Gemini quota exhausted')
    );

    const out = await aiRouter.executeFactCheck({
      text: 'Open-source local models reduce reliance on metered proprietary APIs.',
    });

    expect(out.meta.providerUsed).toBe('local-oss');
    expect(out.meta.failoverCount).toBeGreaterThanOrEqual(4);
    expect(out.meta.degradedOfflineFallback).toBe(true);
    expect(out.meta.deferredJobId).toBeDefined();
    expect(out.value.claims.length).toBeGreaterThanOrEqual(1);

    const telemetry = aiRouter.getTelemetry();
    expect(telemetry.adminAlerts.length).toBeGreaterThanOrEqual(3);
    expect(telemetry.failoverHistory.length).toBeGreaterThanOrEqual(4);
    expect(telemetry.deferredQueue.length).toBe(1);

    // Repeat identical fact-check hits SHA-256 response cache
    const cachedOut = await aiRouter.executeFactCheck({
      text: 'Open-source local models reduce reliance on metered proprietary APIs.',
    });
    expect(cachedOut.meta.cacheHit).toBe(true);
    expect(cachedOut.meta.estimatedCostUsd).toBe(0);
    expect(aiRouter.getTelemetry().cacheStats.hits).toBeGreaterThanOrEqual(1);

    // Acknowledge alerts and clear cache
    expect(aiRouter.acknowledgeAlert('all')).toBeGreaterThanOrEqual(1);
    aiRouter.clearCache();
    expect(aiRouter.getTelemetry().cacheStats.entries).toBe(0);

    // Recover Gemini and replay deferred offline job successfully
    aiRouter.updateProvider('gemini', { health: 'healthy', creditBalanceUsd: 40 });
    vi.spyOn(geminiModule, 'factCheckAndVerifySourcesWithGemini').mockResolvedValueOnce({
      checkedAt: new Date().toISOString(),
      overallVeracityScore: 94,
      verifiedCount: 1,
      disputedCount: 0,
      unverifiedCount: 0,
      summary: 'Replayed and verified via Gemini.',
      claims: [],
      groundingSources: [],
    });

    const replay = await aiRouter.replayDeferredQueue();
    expect(replay.processed).toBe(1);
    expect(replay.succeeded).toBe(1);
    expect(replay.queue[0].status).toBe('completed');
  });

  it('triggers preemptive credit switching before $0 balance and handles probes & multimodal fallbacks', async () => {
    aiRouter.updatePolicy({ preemptiveCreditSwitchUsd: 0.5, enableResponseCache: false });
    aiRouter.updateProvider('gemini', {
      configured: true,
      enabled: true,
      health: 'healthy',
      creditLimitUsd: 50,
      creditBalanceUsd: 0.4, // already at/below pre-exhaustion threshold $0.50
      preExhaustionThresholdUsd: 0.5,
    });
    aiRouter.updateProvider('ollama', {
      configured: true,
      enabled: true,
      health: 'healthy',
      endpoint: 'http://127.0.0.1:11434',
    });

    // Chain must skip Gemini before touching $0 and create PREEMPTIVE_CREDIT_EXHAUSTION alert
    const chain = aiRouter.selectCandidateChain({ allowCloud: true });
    expect(chain.some((c) => c.id === 'gemini')).toBe(false);
    const telemetry = aiRouter.getTelemetry();
    expect(telemetry.adminAlerts.some((a) => a.code === 'PREEMPTIVE_CREDIT_EXHAUSTION')).toBe(true);

    // Probe local servers cleanly (mock reachable + unreachable)
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const probed = await aiRouter.probeProviders();
    expect(probed.find((p) => p.id === 'local-oss')?.health).toBe('healthy');
    expect(probed.find((p) => p.id === 'ollama')?.health).toBe('healthy');
    expect(probed.find((p) => p.id === 'gemini')?.health).toBe('exhausted');

    // Multimodal image, audio, video & cross-lingual/entailment/citation fallbacks run cleanly without throwing even in offline mode
    aiRouter.updatePolicy({ offlineMode: true });
    aiRouter.updateProvider('ollama', { enabled: false });
    const imgOut = await aiRouter.executeImageForensics({
      buffer: Buffer.from('Stable Diffusion generated PNG test payload'),
      mimeType: 'image/png',
      fileName: 'sd.png',
    });
    expect(imgOut.meta.providerUsed).toBe('local-oss');

    const audOut = await aiRouter.executeAudioTranscription({
      buffer: Buffer.from('ID3audio'),
      mimeType: 'audio/mpeg',
      fileName: 'voice.mp3',
    });
    expect(audOut.value).toContain('voice.mp3');

    const vidOut = await aiRouter.executeVideoForensics({
      buffer: Buffer.from('ftypmp4'),
      mimeType: 'video/mp4',
      fileName: 'clip.mp4',
    });
    expect(vidOut.value.transcript).toContain('clip.mp4');

    const clOut = await aiRouter.executeCrossLingualPlagiarism({ text: 'Translated essay.' });
    expect(clOut.value).toEqual([]);
    expect(clOut.meta.deferredJobId).toBeDefined();

    const entOut = await aiRouter.executeCitationEntailment({
      claim: 'Water boils at 100C',
      citationUrl: 'https://example.org',
    });
    expect(entOut.value.status).toBe('Not Found in Source');
    expect(entOut.meta.deferredJobId).toBeDefined();

    const citOut = await aiRouter.executeCitationLookup({ query: 'Transformer Architecture' });
    expect(citOut.value.title).toBe('Transformer Architecture');
    expect(citOut.meta.deferredJobId).toBeDefined();

    const codeOut = await aiRouter.executeCodeForensics({
      code: 'export const add = (a: number, b: number) => a + b;',
      language: 'TypeScript',
    });
    expect(codeOut.meta.providerUsed).toBe('local-oss');
  });

  it('covers env credential synchronization, OpenAI-compatible/Anthropic/Ollama error paths, credit warnings, and deferred queue replay variants', async () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.VLLM_BASE_URL = 'http://127.0.0.1:8000';
    process.env.LMSTUDIO_BASE_URL = 'http://127.0.0.1:1234';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.GEMINI_API_KEY = 'sk-gem-test';
    process.env.OPENAI_API_KEY = 'sk-oa-test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.GROQ_API_KEY = 'sk-groq-test';
    process.env.TOGETHER_API_KEY = 'sk-tog-test';
    process.env.CUSTOM_AI_BASE_URL = 'http://127.0.0.1:9001/v1/chat/completions';
    process.env.CUSTOM_AI_API_KEY = 'sk-custom-test';

    aiRouter.syncEnvCredentials();
    const tEnv = aiRouter.getTelemetry();
    expect(tEnv.providers.every((p) => p.configured)).toBe(true);

    // Ollama and Anthropic return non-OK -> failover hits Together / Custom OpenAI-compatible endpoints
    aiRouter.updatePolicy({ strategy: 'local-first', enableResponseCache: false, retryMaxAttempts: 1 });
    for (const id of ['vllm', 'lmstudio', 'openrouter', 'gemini', 'openai', 'groq'] as const) {
      aiRouter.updateProvider(id, { enabled: false });
    }
    aiRouter.updateProvider('together', {
      creditLimitUsd: 1,
      creditBalanceUsd: 0.14,
      warningThresholdPercent: 20,
      preExhaustionThresholdUsd: 0.01,
    });

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('/api/chat')) {
        return new Response('ollama busy', { status: 503 });
      }
      if (s.includes('/v1/messages')) {
        return new Response('anthropic overloaded', { status: 529 });
      }
      if (s.includes('api.together.xyz')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    aiCodeProbability: 31,
                    confidence: 86,
                    suspectedAssistant: 'Together Qwen',
                    summary: 'Clean module.',
                    llmIdiomFindings: [],
                    securityNotes: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const codeRes = await aiRouter.executeCodeForensics({
      code: 'export function mul(a: number, b: number) { return a * b; }',
      language: 'TypeScript',
    });
    expect(codeRes.meta.providerUsed).toBe('together');
    expect(aiRouter.getTelemetry().adminAlerts.some((a) => a.code === 'CREDIT_LOW_WARNING')).toBe(true);

    // Test vLLM local /v1/chat/completions adapter & non-OK error handling on OpenAI-compatible server
    aiRouter.updateProvider('vllm', { enabled: true, endpoint: 'http://127.0.0.1:8000' });
    aiRouter.updateProvider('together', { enabled: false });
    aiRouter.updateProvider('custom', { enabled: true });

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('8000/v1/chat/completions')) {
        return new Response('vLLM OOM', { status: 500 });
      }
      if (s.includes('9001')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    webMatches: [
                      {
                        url: 'https://example.edu/paper',
                        title: 'Local Paper',
                        matchedExcerpt: 'sample overlap',
                        similarityNote: '65%',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

    const webRes = await aiRouter.executeWebPlagiarism({
      text: 'Sample engineering text for custom OpenAI-compatible check.',
    });
    expect(webRes.meta.providerUsed).toBe('custom');
    expect(webRes.value.webMatches).toHaveLength(1);

    // Offline queuing and replay for plagiarism-web and citation-lookup
    aiRouter.updatePolicy({ offlineMode: true });
    await aiRouter.executeWebPlagiarism({ text: 'Offline web plagiarism check payload.' });
    await aiRouter.executeCitationLookup({ query: 'Attention Mechanisms Survey' });
    expect(aiRouter.getTelemetry().deferredQueue.length).toBeGreaterThanOrEqual(2);

    aiRouter.updatePolicy({ offlineMode: false });
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('9001')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    webMatches: [],
                    title: 'Attention Mechanisms Survey',
                    authors: ['Doe'],
                    year: '2024',
                    publisherOrJournal: 'Journal',
                    sourceType: 'Journal Article',
                    verificationStatus: 'Verified Source',
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    aiRouter.updateProvider('ollama', { enabled: false });
    aiRouter.updateProvider('vllm', { enabled: false });
    aiRouter.updateProvider('lmstudio', { enabled: false });
    aiRouter.updateProvider('anthropic', { enabled: false });

    const replay = await aiRouter.replayDeferredQueue();
    expect(replay.processed).toBeGreaterThanOrEqual(2);
    expect(replay.succeeded).toBeGreaterThanOrEqual(2);

    // Test OpenAI-compatible cross-lingual & citation entailment + citation vault local match
    await aiRouter.executeTextDetection({
      text: 'Custom OpenAI compatible endpoint check.',
      sentences: splitSentencesWithOffsets('Custom OpenAI compatible endpoint check.'),
    });
    await aiRouter.executeCrossLingualPlagiarism({ text: 'Monolingual technical summary.' });
    await aiRouter.executeCitationEntailment({
      claim: 'Neural scaling improves perplexity.',
      citationUrl: 'https://example.edu/paper',
    });

    // Local OSS humanization aggressive intensity + existing citation vault lookup match
    const { store } = await import('../../src/server/store.ts');
    store.addCitation({
      title: 'Existing Local Benchmark Study',
      authors: ['Ada Lovelace'],
      year: '2025',
      publisherOrJournal: 'Open Science',
      sourceType: 'Journal Article',
      verificationStatus: 'Verified Source',
      tags: [],
    });
    aiRouter.updatePolicy({ offlineMode: true, cacheTtlSeconds: 10 });
    const existingLookup = await aiRouter.executeCitationLookup({
      query: 'Existing Local Benchmark Study',
    });
    expect(existingLookup.value.publisherOrJournal).toBe('Open Science');

    const humAgg = await aiRouter.executeHumanize({
      text: 'Furthermore, we do not delve into robust seamless integration unless it is essential.',
      intensity: 'aggressive',
    });
    expect(humAgg.value.humanizedText).toContain('dig into');
    expect(humAgg.value.humanizedText).toContain('resilient');
  });
});
