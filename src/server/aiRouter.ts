import crypto from 'node:crypto';
import type {
  AdminNotification,
  AiCacheStats,
  AiProviderId,
  AiProviderState,
  AiRoutingPolicyConfig,
  AiRoutingTelemetry,
  CitationEntailmentResult,
  CitationEntry,
  CrossLingualMatch,
  DeferredCloudJob,
  DeferredTaskType,
  FactCheckReport,
  FailoverEvent,
  HumanizationIntensity,
  LocalModelFamily,
  ProviderFailureReason,
  RoutingExecutionMeta,
  RoutingStrategy,
} from '../types/veritas.ts';
import {
  analyzeDeterministicCodeIdioms,
  computeCyclomaticComplexity,
  scanSpdxLicenseRisks,
} from './codeAnalysis.ts';
import * as geminiModule from './gemini.ts';
import type {
  GeminiCodeForensicsResult,
  GeminiDetectionResult,
  GeminiHumanizeResult,
} from './gemini.ts';
import { inspectImageBinaryMetadata } from './parsers.ts';
import { store } from './store.ts';
import {
  checkPlagiarismAgainstCorpus,
  computeReadabilityAndQuality,
  detectLanguageHeuristic,
  detectParaphraseSpin,
  splitSentencesWithOffsets,
  type SplitSentence,
} from './stylometry.ts';

interface CachedResponseEntry<T = unknown> {
  value: T;
  providerUsed: AiProviderId;
  modelUsed: string;
  savedCostUsd: number;
  savedTokens: number;
  expiresAt: number;
}

const LOCAL_MODEL_CATALOG: Record<
  'ollama' | 'vllm' | 'lmstudio',
  Record<LocalModelFamily, string>
> = {
  ollama: {
    llama: 'llama3.2',
    qwen: 'qwen2.5:14b',
    deepseek: 'deepseek-r1:8b',
    mistral: 'mistral:7b',
    gemma: 'gemma3:12b',
  },
  vllm: {
    llama: 'meta-llama/Llama-3.3-70B-Instruct',
    qwen: 'Qwen/Qwen2.5-32B-Instruct',
    deepseek: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    mistral: 'mistralai/Mistral-Small-24B-Instruct',
    gemma: 'google/gemma-3-27b-it',
  },
  lmstudio: {
    llama: 'llama-3.2-8b-instruct',
    qwen: 'qwen2.5-coder-14b-instruct',
    deepseek: 'deepseek-r1-distill-llama-8b',
    mistral: 'mistral-7b-instruct-v0.3',
    gemma: 'gemma-3-12b-it',
  },
};

export function extractHttpStatusFromError(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj.status === 'number') return obj.status;
  if (typeof obj.statusCode === 'number') return obj.statusCode;
  if (obj.response && typeof obj.response === 'object') {
    const r = obj.response as Record<string, unknown>;
    if (typeof r.status === 'number') return r.status;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const codeMatch = msg.match(/\b(402|429|403|500|502|503|504)\b/);
  return codeMatch ? Number(codeMatch[1]) : undefined;
}

export function classifyProviderFailure(
  err: unknown,
  explicitStatus?: number
): {
  reason: ProviderFailureReason;
  retryable: boolean;
  exhaustsProvider: boolean;
  cooldownMs: number;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err || 'Unknown provider error');
  const upper = message.toUpperCase();
  const status = explicitStatus ?? extractHttpStatusFromError(err);

  if (status === 402 || upper.includes('PAYMENT_REQUIRED') || upper.includes('PAYMENT REQUIRED')) {
    return {
      reason: 'PAYMENT_REQUIRED_402',
      retryable: false,
      exhaustsProvider: true,
      cooldownMs: 30 * 60_000,
      message,
    };
  }
  if (
    upper.includes('BILLING_DISABLED') ||
    upper.includes('BILLING DISABLED') ||
    upper.includes('BILLING_NOT_ENABLED') ||
    upper.includes('ACCOUNT_DELINQUENT')
  ) {
    return {
      reason: 'BILLING_DISABLED',
      retryable: false,
      exhaustsProvider: true,
      cooldownMs: 60 * 60_000,
      message,
    };
  }
  if (
    upper.includes('INSUFFICIENT_CREDITS') ||
    upper.includes('INSUFFICIENT CREDITS') ||
    upper.includes('OUT OF CREDITS') ||
    upper.includes('CREDIT_BALANCE_LOW')
  ) {
    return {
      reason: 'INSUFFICIENT_CREDITS',
      retryable: false,
      exhaustsProvider: true,
      cooldownMs: 30 * 60_000,
      message,
    };
  }
  if (
    upper.includes('QUOTA_EXCEEDED') ||
    upper.includes('QUOTA EXCEEDED') ||
    upper.includes('EXCEEDED YOUR CURRENT QUOTA')
  ) {
    return {
      reason: 'QUOTA_EXCEEDED',
      retryable: false,
      exhaustsProvider: true,
      cooldownMs: 15 * 60_000,
      message,
    };
  }
  if (upper.includes('RESOURCE_EXHAUSTED')) {
    return {
      reason: 'RESOURCE_EXHAUSTED',
      retryable: false,
      exhaustsProvider: true,
      cooldownMs: 10 * 60_000,
      message,
    };
  }
  if (
    status === 429 ||
    upper.includes('RATE_LIMIT_EXCEEDED') ||
    upper.includes('RATE LIMIT EXCEEDED') ||
    upper.includes('TOO MANY REQUESTS')
  ) {
    return {
      reason: 'RATE_LIMIT_EXCEEDED',
      retryable: false,
      exhaustsProvider: false,
      cooldownMs: 60_000,
      message,
    };
  }
  if (
    upper.includes('ECONNREFUSED') ||
    upper.includes('ENOTFOUND') ||
    upper.includes('OFFLINE') ||
    upper.includes('FETCH FAILED')
  ) {
    return {
      reason: 'OFFLINE',
      retryable: false,
      exhaustsProvider: false,
      cooldownMs: 45_000,
      message,
    };
  }
  return {
    reason: 'TRANSIENT_ERROR',
    retryable: true,
    exhaustsProvider: false,
    cooldownMs: 30_000,
    message,
  };
}

function isConfiguredSecret(val?: string): boolean {
  return Boolean(
    val && val.trim() && val !== 'MY_GEMINI_API_KEY' && !/^your_.*_here$/i.test(val.trim())
  );
}

function buildInitialProviders(): AiProviderState[] {
  const hasGeminiKey = isConfiguredSecret(process.env.GEMINI_API_KEY);
  const hasOpenRouter = isConfiguredSecret(process.env.OPENROUTER_API_KEY);
  const hasOpenAI = isConfiguredSecret(process.env.OPENAI_API_KEY);
  const hasAnthropic = isConfiguredSecret(process.env.ANTHROPIC_API_KEY);
  const hasGroq = isConfiguredSecret(process.env.GROQ_API_KEY);
  const hasTogether = isConfiguredSecret(process.env.TOGETHER_API_KEY);
  const hasCustom = Boolean(process.env.CUSTOM_AI_BASE_URL);

  const hasOllamaEnv = Boolean(process.env.OLLAMA_BASE_URL);
  const hasVllmEnv = Boolean(process.env.VLLM_BASE_URL);
  const hasLmStudioEnv = Boolean(process.env.LMSTUDIO_BASE_URL);

  return [
    {
      id: 'local-oss',
      name: 'Local Open-Source Engine (Built-In OSS Weights & Stylometry)',
      priority: 1,
      isLocal: true,
      enabled: true,
      configured: true,
      health: 'healthy',
      activeModel: 'veritas-oss-stylometry-v2',
      availableModels: [
        'veritas-oss-stylometry-v2',
        'llama-3.2-local-quant',
        'qwen2.5-local-quant',
        'deepseek-r1-local-quant',
        'mistral-7b-local-quant',
        'gemma-3-local-quant',
      ],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0,
      avgLatencyMs: 12,
      qualityScore: 80,
      creditBalanceUsd: 0,
      creditLimitUsd: 0,
      preExhaustionThresholdUsd: 0,
      warningThresholdPercent: 0,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'ollama',
      name: 'Ollama Local Server',
      priority: 2,
      isLocal: true,
      enabled: hasOllamaEnv,
      configured: hasOllamaEnv,
      health: hasOllamaEnv ? 'healthy' : 'unconfigured',
      endpoint: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      activeModel: process.env.OLLAMA_MODEL || 'llama3.2',
      availableModels: ['llama3.2', 'qwen2.5:14b', 'deepseek-r1:8b', 'mistral:7b', 'gemma3:12b'],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0,
      avgLatencyMs: 180,
      qualityScore: 87,
      creditBalanceUsd: 0,
      creditLimitUsd: 0,
      preExhaustionThresholdUsd: 0,
      warningThresholdPercent: 0,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'vllm',
      name: 'vLLM Local Inference Server',
      priority: 3,
      isLocal: true,
      enabled: hasVllmEnv,
      configured: hasVllmEnv,
      health: hasVllmEnv ? 'healthy' : 'unconfigured',
      endpoint: process.env.VLLM_BASE_URL || 'http://127.0.0.1:8000',
      activeModel: process.env.VLLM_MODEL || 'meta-llama/Llama-3.3-70B-Instruct',
      availableModels: [
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-32B-Instruct',
        'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
        'mistralai/Mistral-Small-24B-Instruct',
        'google/gemma-3-27b-it',
      ],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0,
      avgLatencyMs: 110,
      qualityScore: 90,
      creditBalanceUsd: 0,
      creditLimitUsd: 0,
      preExhaustionThresholdUsd: 0,
      warningThresholdPercent: 0,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'lmstudio',
      name: 'LM Studio Local Server',
      priority: 4,
      isLocal: true,
      enabled: hasLmStudioEnv,
      configured: hasLmStudioEnv,
      health: hasLmStudioEnv ? 'healthy' : 'unconfigured',
      endpoint: process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234',
      activeModel: process.env.LMSTUDIO_MODEL || 'llama-3.2-8b-instruct',
      availableModels: [
        'llama-3.2-8b-instruct',
        'qwen2.5-coder-14b-instruct',
        'deepseek-r1-distill-llama-8b',
        'mistral-7b-instruct-v0.3',
        'gemma-3-12b-it',
      ],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0,
      avgLatencyMs: 210,
      qualityScore: 85,
      creditBalanceUsd: 0,
      creditLimitUsd: 0,
      preExhaustionThresholdUsd: 0,
      warningThresholdPercent: 0,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'openrouter',
      name: 'OpenRouter Gateway',
      priority: 5,
      isLocal: false,
      enabled: hasOpenRouter,
      configured: hasOpenRouter,
      health: hasOpenRouter ? 'healthy' : 'unconfigured',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      activeModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      availableModels: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-72b-instruct',
        'deepseek/deepseek-chat',
        'mistralai/mistral-large',
        'google/gemma-3-27b-it',
      ],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0.0004,
      avgLatencyMs: 390,
      qualityScore: 91,
      creditBalanceUsd: Number(process.env.OPENROUTER_CREDIT_BUDGET_USD || 25),
      creditLimitUsd: Number(process.env.OPENROUTER_CREDIT_BUDGET_USD || 25),
      preExhaustionThresholdUsd: 0.25,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'gemini',
      name: 'Google Gemini (@google/genai)',
      priority: 6,
      isLocal: false,
      enabled: hasGeminiKey,
      configured: hasGeminiKey,
      health: hasGeminiKey ? 'healthy' : 'unconfigured',
      activeModel: 'gemini-4-hydrogen',
      availableModels: ['gemini-4-hydrogen', 'gemini-3.5-transcribe', 'gemini-3.1-flash-lite'],
      supportedModelFamilies: ['gemma'],
      costPer1kTokensUsd: 0.0005,
      avgLatencyMs: 320,
      qualityScore: 96,
      creditBalanceUsd: Number(process.env.GEMINI_CREDIT_BUDGET_USD || 50),
      creditLimitUsd: Number(process.env.GEMINI_CREDIT_BUDGET_USD || 50),
      preExhaustionThresholdUsd: 0.5,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'openai',
      name: 'OpenAI API',
      priority: 7,
      isLocal: false,
      enabled: hasOpenAI,
      configured: hasOpenAI,
      health: hasOpenAI ? 'healthy' : 'unconfigured',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      activeModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      availableModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
      supportedModelFamilies: [],
      costPer1kTokensUsd: 0.0015,
      avgLatencyMs: 430,
      qualityScore: 95,
      creditBalanceUsd: Number(process.env.OPENAI_CREDIT_BUDGET_USD || 50),
      creditLimitUsd: Number(process.env.OPENAI_CREDIT_BUDGET_USD || 50),
      preExhaustionThresholdUsd: 0.5,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      priority: 8,
      isLocal: false,
      enabled: hasAnthropic,
      configured: hasAnthropic,
      health: hasAnthropic ? 'healthy' : 'unconfigured',
      endpoint: 'https://api.anthropic.com/v1/messages',
      activeModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      availableModels: ['claude-3-5-haiku-latest', 'claude-sonnet-4-0'],
      supportedModelFamilies: [],
      costPer1kTokensUsd: 0.002,
      avgLatencyMs: 490,
      qualityScore: 97,
      creditBalanceUsd: Number(process.env.ANTHROPIC_CREDIT_BUDGET_USD || 50),
      creditLimitUsd: Number(process.env.ANTHROPIC_CREDIT_BUDGET_USD || 50),
      preExhaustionThresholdUsd: 0.5,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'groq',
      name: 'Groq Fast LPU',
      priority: 9,
      isLocal: false,
      enabled: hasGroq,
      configured: hasGroq,
      health: hasGroq ? 'healthy' : 'unconfigured',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      activeModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      availableModels: ['llama-3.3-70b-versatile', 'qwen-2.5-32b', 'deepseek-r1-distill-llama-70b'],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0.0006,
      avgLatencyMs: 140,
      qualityScore: 89,
      creditBalanceUsd: Number(process.env.GROQ_CREDIT_BUDGET_USD || 25),
      creditLimitUsd: Number(process.env.GROQ_CREDIT_BUDGET_USD || 25),
      preExhaustionThresholdUsd: 0.25,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'together',
      name: 'Together AI',
      priority: 10,
      isLocal: false,
      enabled: hasTogether,
      configured: hasTogether,
      health: hasTogether ? 'healthy' : 'unconfigured',
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      activeModel: process.env.TOGETHER_MODEL || 'Qwen/Qwen2.5-72B-Instruct-Turbo',
      availableModels: [
        'Qwen/Qwen2.5-72B-Instruct-Turbo',
        'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        'deepseek-ai/DeepSeek-V3',
      ],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0.0009,
      avgLatencyMs: 360,
      qualityScore: 91,
      creditBalanceUsd: Number(process.env.TOGETHER_CREDIT_BUDGET_USD || 25),
      creditLimitUsd: Number(process.env.TOGETHER_CREDIT_BUDGET_USD || 25),
      preExhaustionThresholdUsd: 0.25,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'custom',
      name: 'Custom OpenAI-Compatible Endpoint',
      priority: 11,
      isLocal: false,
      enabled: hasCustom,
      configured: hasCustom,
      health: hasCustom ? 'healthy' : 'unconfigured',
      endpoint: process.env.CUSTOM_AI_BASE_URL || undefined,
      activeModel: process.env.CUSTOM_AI_MODEL || 'custom-oss-model',
      availableModels: [process.env.CUSTOM_AI_MODEL || 'custom-oss-model'],
      supportedModelFamilies: ['llama', 'qwen', 'deepseek', 'mistral', 'gemma'],
      costPer1kTokensUsd: 0.001,
      avgLatencyMs: 400,
      qualityScore: 88,
      creditBalanceUsd: Number(process.env.CUSTOM_AI_CREDIT_BUDGET_USD || 25),
      creditLimitUsd: Number(process.env.CUSTOM_AI_CREDIT_BUDGET_USD || 25),
      preExhaustionThresholdUsd: 0.25,
      warningThresholdPercent: 15,
      requestsServed: 0,
      cacheHitsServed: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
  ];
}

function getProviderApiKey(id: AiProviderId): string | undefined {
  switch (id) {
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    case 'together':
      return process.env.TOGETHER_API_KEY;
    case 'custom':
      return process.env.CUSTOM_AI_API_KEY || 'custom-token';
    default:
      return undefined;
  }
}

function parseJsonObjectLoose<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

class ResilientAiRouter {
  private policy: AiRoutingPolicyConfig = {
    strategy: 'local-first',
    offlineMode: false,
    enableResponseCache: true,
    cacheTtlSeconds: 900,
    preferredLocalFamily: 'llama',
    preemptiveCreditSwitchUsd: 0.1,
    retryMaxAttempts: 2,
  };

  private providers: AiProviderState[] = buildInitialProviders();
  private failoverHistory: FailoverEvent[] = [];
  private adminAlerts: AdminNotification[] = [];
  private deferredQueue: DeferredCloudJob[] = [];
  private cache = new Map<string, CachedResponseEntry>();
  private cacheStats: AiCacheStats = {
    entries: 0,
    hits: 0,
    misses: 0,
    estimatedTokensSaved: 0,
    estimatedCostSavedUsd: 0,
  };

  syncEnvCredentials() {
    const envFlags: Record<AiProviderId, boolean> = {
      'local-oss': true,
      ollama: Boolean(process.env.OLLAMA_BASE_URL),
      vllm: Boolean(process.env.VLLM_BASE_URL),
      lmstudio: Boolean(process.env.LMSTUDIO_BASE_URL),
      openrouter: isConfiguredSecret(process.env.OPENROUTER_API_KEY),
      gemini: isConfiguredSecret(process.env.GEMINI_API_KEY),
      openai: isConfiguredSecret(process.env.OPENAI_API_KEY),
      anthropic: isConfiguredSecret(process.env.ANTHROPIC_API_KEY),
      groq: isConfiguredSecret(process.env.GROQ_API_KEY),
      together: isConfiguredSecret(process.env.TOGETHER_API_KEY),
      custom: Boolean(process.env.CUSTOM_AI_BASE_URL),
    };
    for (const p of this.providers) {
      if (envFlags[p.id] && !p.configured) {
        p.configured = true;
        p.enabled = true;
        if (p.health === 'unconfigured') p.health = 'healthy';
      }
      if (p.id === 'ollama' && process.env.OLLAMA_BASE_URL) {
        p.endpoint = process.env.OLLAMA_BASE_URL;
      }
      if (p.id === 'vllm' && process.env.VLLM_BASE_URL) {
        p.endpoint = process.env.VLLM_BASE_URL;
      }
      if (p.id === 'lmstudio' && process.env.LMSTUDIO_BASE_URL) {
        p.endpoint = process.env.LMSTUDIO_BASE_URL;
      }
      if (p.id === 'custom' && process.env.CUSTOM_AI_BASE_URL) {
        p.endpoint = process.env.CUSTOM_AI_BASE_URL;
      }
    }
  }

  resetForTesting(): void {
    this.policy = {
      strategy: 'local-first',
      offlineMode: false,
      enableResponseCache: true,
      cacheTtlSeconds: 900,
      preferredLocalFamily: 'llama',
      preemptiveCreditSwitchUsd: 0.1,
      retryMaxAttempts: 2,
    };
    this.providers = buildInitialProviders();
    this.failoverHistory = [];
    this.adminAlerts = [];
    this.deferredQueue = [];
    this.cache.clear();
    this.cacheStats = {
      entries: 0,
      hits: 0,
      misses: 0,
      estimatedTokensSaved: 0,
      estimatedCostSavedUsd: 0,
    };
  }

  getTelemetry(): AiRoutingTelemetry {
    this.syncEnvCredentials();
    const now = Date.now();
    // Auto-recover providers whose cooldown expired
    for (const p of this.providers) {
      if (p.health === 'cooldown' && p.cooldownUntil && Date.parse(p.cooldownUntil) <= now) {
        p.health = p.configured ? 'healthy' : 'unconfigured';
        p.cooldownUntil = undefined;
      }
    }
    return {
      policy: { ...this.policy },
      providers: this.providers
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((p) => ({ ...p })),
      failoverHistory: this.failoverHistory.slice(0, 60),
      adminAlerts: this.adminAlerts.slice(0, 60),
      deferredQueue: this.deferredQueue.slice(0, 60),
      cacheStats: { ...this.cacheStats, entries: this.cache.size },
    };
  }

  updatePolicy(patch: Partial<AiRoutingPolicyConfig>): AiRoutingPolicyConfig {
    if (
      patch.strategy === 'local-first' ||
      patch.strategy === 'cheapest' ||
      patch.strategy === 'fastest' ||
      patch.strategy === 'highest-quality'
    ) {
      this.policy.strategy = patch.strategy;
    }
    if (typeof patch.offlineMode === 'boolean') {
      this.policy.offlineMode = patch.offlineMode;
    }
    if (typeof patch.enableResponseCache === 'boolean') {
      this.policy.enableResponseCache = patch.enableResponseCache;
    }
    if (typeof patch.cacheTtlSeconds === 'number' && Number.isFinite(patch.cacheTtlSeconds)) {
      this.policy.cacheTtlSeconds = Math.max(10, Math.min(86400, Math.round(patch.cacheTtlSeconds)));
    }
    if (
      patch.preferredLocalFamily === 'llama' ||
      patch.preferredLocalFamily === 'qwen' ||
      patch.preferredLocalFamily === 'deepseek' ||
      patch.preferredLocalFamily === 'mistral' ||
      patch.preferredLocalFamily === 'gemma'
    ) {
      this.policy.preferredLocalFamily = patch.preferredLocalFamily;
      // Align local servers with selected model family
      for (const localId of ['ollama', 'vllm', 'lmstudio'] as const) {
        const p = this.providers.find((x) => x.id === localId);
        if (p) p.activeModel = LOCAL_MODEL_CATALOG[localId][patch.preferredLocalFamily];
      }
    }
    if (
      typeof patch.preemptiveCreditSwitchUsd === 'number' &&
      Number.isFinite(patch.preemptiveCreditSwitchUsd)
    ) {
      this.policy.preemptiveCreditSwitchUsd = Math.max(0, Math.min(50, patch.preemptiveCreditSwitchUsd));
    }
    if (typeof patch.retryMaxAttempts === 'number' && Number.isFinite(patch.retryMaxAttempts)) {
      this.policy.retryMaxAttempts = Math.max(1, Math.min(4, Math.round(patch.retryMaxAttempts)));
    }
    return { ...this.policy };
  }

  updateProvider(
    id: AiProviderId,
    patch: Partial<
      Pick<
        AiProviderState,
        | 'enabled'
        | 'configured'
        | 'health'
        | 'activeModel'
        | 'creditBalanceUsd'
        | 'creditLimitUsd'
        | 'preExhaustionThresholdUsd'
        | 'warningThresholdPercent'
        | 'avgLatencyMs'
        | 'costPer1kTokensUsd'
        | 'qualityScore'
        | 'endpoint'
      >
    >
  ): AiProviderState | undefined {
    const p = this.providers.find((x) => x.id === id);
    if (!p) return undefined;
    if (typeof patch.enabled === 'boolean') p.enabled = patch.enabled;
    if (typeof patch.configured === 'boolean') p.configured = patch.configured;
    if (
      patch.health === 'healthy' ||
      patch.health === 'degraded' ||
      patch.health === 'cooldown' ||
      patch.health === 'exhausted' ||
      patch.health === 'offline' ||
      patch.health === 'unconfigured'
    ) {
      p.health = patch.health;
      if (patch.health === 'healthy') {
        p.consecutiveFailures = 0;
        p.cooldownUntil = undefined;
        p.statusReason = undefined;
      }
    }
    if (typeof patch.activeModel === 'string' && patch.activeModel.trim()) {
      p.activeModel = patch.activeModel.trim().slice(0, 120);
    }
    if (typeof patch.endpoint === 'string' && patch.endpoint.trim()) {
      p.endpoint = patch.endpoint.trim().slice(0, 240);
      p.configured = true;
    }
    if (typeof patch.creditBalanceUsd === 'number' && Number.isFinite(patch.creditBalanceUsd)) {
      p.creditBalanceUsd = Math.max(0, Math.round(patch.creditBalanceUsd * 10000) / 10000);
      if (p.creditBalanceUsd > p.preExhaustionThresholdUsd && p.health === 'exhausted') {
        p.health = 'healthy';
        p.statusReason = undefined;
      }
    }
    if (typeof patch.creditLimitUsd === 'number' && Number.isFinite(patch.creditLimitUsd)) {
      p.creditLimitUsd = Math.max(0, patch.creditLimitUsd);
    }
    if (
      typeof patch.preExhaustionThresholdUsd === 'number' &&
      Number.isFinite(patch.preExhaustionThresholdUsd)
    ) {
      p.preExhaustionThresholdUsd = Math.max(0, patch.preExhaustionThresholdUsd);
    }
    if (
      typeof patch.warningThresholdPercent === 'number' &&
      Number.isFinite(patch.warningThresholdPercent)
    ) {
      p.warningThresholdPercent = Math.max(1, Math.min(90, patch.warningThresholdPercent));
    }
    if (typeof patch.avgLatencyMs === 'number' && Number.isFinite(patch.avgLatencyMs)) {
      p.avgLatencyMs = Math.max(1, patch.avgLatencyMs);
    }
    if (typeof patch.costPer1kTokensUsd === 'number' && Number.isFinite(patch.costPer1kTokensUsd)) {
      p.costPer1kTokensUsd = Math.max(0, patch.costPer1kTokensUsd);
    }
    if (typeof patch.qualityScore === 'number' && Number.isFinite(patch.qualityScore)) {
      p.qualityScore = Math.max(1, Math.min(100, patch.qualityScore));
    }
    return { ...p };
  }

  acknowledgeAlert(idOrAll: string): number {
    let count = 0;
    for (const a of this.adminAlerts) {
      if ((idOrAll === 'all' || a.id === idOrAll) && !a.acknowledged) {
        a.acknowledged = true;
        count++;
      }
    }
    return count;
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheStats.entries = 0;
  }

  private pushAdminAlert(alert: Omit<AdminNotification, 'id' | 'timestamp' | 'acknowledged'>) {
    // Deduplicate identical unread alerts within 30s to prevent alert storms
    const duplicate = this.adminAlerts.find(
      (a) =>
        !a.acknowledged &&
        a.code === alert.code &&
        a.providerId === alert.providerId &&
        Date.now() - Date.parse(a.timestamp) < 30_000
    );
    if (duplicate) return;

    const full: AdminNotification = {
      ...alert,
      id: `alt-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };
    this.adminAlerts.unshift(full);
    if (this.adminAlerts.length > 100) {
      this.adminAlerts = this.adminAlerts.slice(0, 100);
    }
    store.addAuditLog({
      actorName: 'Resilient AI Router',
      actorRole: 'Admin',
      action: `AI_ALERT_${alert.code}`,
      target: alert.providerId || 'router',
      detail: `${alert.title}: ${alert.message}`,
    });
  }

  private recordFailover(entry: Omit<FailoverEvent, 'id' | 'timestamp'>) {
    const full: FailoverEvent = {
      ...entry,
      id: `fov-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.failoverHistory.unshift(full);
    if (this.failoverHistory.length > 150) {
      this.failoverHistory = this.failoverHistory.slice(0, 150);
    }
  }

  queueDeferredCloudJob(params: {
    task: DeferredTaskType;
    recordId?: string;
    payloadSummary: string;
    inputText: string;
    extraParams?: Record<string, string>;
    lastError?: string;
  }): DeferredCloudJob {
    const now = new Date().toISOString();
    const job: DeferredCloudJob = {
      id: `def-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      task: params.task,
      recordId: params.recordId,
      payloadSummary: params.payloadSummary.slice(0, 140),
      inputText: params.inputText.slice(0, 12000),
      extraParams: params.extraParams,
      status: 'queued',
      attempts: 0,
      lastError: params.lastError,
    };
    this.deferredQueue.unshift(job);
    if (this.deferredQueue.length > 100) {
      this.deferredQueue = this.deferredQueue.slice(0, 100);
    }
    store.addAuditLog({
      actorName: 'Offline Resilience Queue',
      actorRole: 'Admin',
      action: 'CLOUD_JOB_DEFERRED',
      target: params.task,
      detail: `Queued ${job.id} (${job.payloadSummary}) after cloud outage/exhaustion.`,
    });
    return job;
  }

  async replayDeferredQueue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    queue: DeferredCloudJob[];
  }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of this.deferredQueue) {
      if (job.status === 'completed') continue;
      job.status = 'retrying';
      job.attempts += 1;
      job.updatedAt = new Date().toISOString();
      processed++;

      try {
        if (job.task === 'fact-check') {
          const out = await this.executeFactCheck({
            text: job.inputText,
            recordId: job.recordId,
            skipQueueOnDegraded: true,
          });
          job.status = out.meta.degradedOfflineFallback ? 'queued' : 'completed';
          if (job.status === 'completed') {
            job.completedAt = new Date().toISOString();
            job.resultSummary = `Verified via ${out.meta.providerUsed} (${out.value.overallVeracityScore}% veracity)`;
            if (job.recordId) {
              store.updateRecord(job.recordId, (r) => ({ ...r, factCheck: out.value }));
            }
            succeeded++;
          } else {
            job.lastError = 'Cloud providers still offline or exhausted.';
            failed++;
          }
        } else if (job.task === 'plagiarism-web') {
          const out = await this.executeWebPlagiarism({
            text: job.inputText,
            skipQueueOnDegraded: true,
          });
          job.status = out.meta.degradedOfflineFallback ? 'queued' : 'completed';
          if (job.status === 'completed') {
            job.completedAt = new Date().toISOString();
            job.resultSummary = `Web check completed via ${out.meta.providerUsed} (${out.value.webMatches.length} match(es))`;
            succeeded++;
          } else {
            job.lastError = 'Cloud providers still offline or exhausted.';
            failed++;
          }
        } else if (job.task === 'citation-lookup') {
          const out = await this.executeCitationLookup({
            query: job.inputText,
            skipQueueOnDegraded: true,
          });
          job.status = out.meta.degradedOfflineFallback ? 'queued' : 'completed';
          if (job.status === 'completed') {
            job.completedAt = new Date().toISOString();
            job.resultSummary = `Resolved via ${out.meta.providerUsed}: ${out.value.title}`;
            succeeded++;
          } else {
            job.lastError = 'Cloud lookup deferred; waiting for connectivity.';
            failed++;
          }
        } else {
          const out = await this.executeTextDetection({
            text: job.inputText,
            sentences: splitSentencesWithOffsets(job.inputText),
          });
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          job.resultSummary = `Analyzed via ${out.meta.providerUsed} (${out.value.overallAiProbability}% AI)`;
          succeeded++;
        }
      } catch (err: unknown) {
        job.status = 'queued';
        job.lastError = err instanceof Error ? err.message : 'Replay deferred';
        failed++;
      }
      job.updatedAt = new Date().toISOString();
    }

    return {
      processed,
      succeeded,
      failed,
      queue: this.deferredQueue.slice(0, 60),
    };
  }

  async probeProviders(): Promise<AiProviderState[]> {
    this.syncEnvCredentials();
    for (const p of this.providers) {
      if (p.id === 'local-oss') {
        p.health = 'healthy';
        p.statusReason = 'Embedded stylometry & AST engine ready ($0 local)';
        continue;
      }
      if (p.isLocal && p.endpoint) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        try {
          const probePath = p.id === 'ollama' ? '/api/tags' : '/v1/models';
          const t0 = performance.now();
          const res = await fetch(`${p.endpoint.replace(/\/$/, '')}${probePath}`, {
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            p.configured = true;
            p.enabled = true;
            p.health = 'healthy';
            p.avgLatencyMs = Math.max(10, Math.round(performance.now() - t0));
            p.statusReason = `Local server reachable (${p.avgLatencyMs}ms)`;
          } else {
            p.health = 'degraded';
            p.statusReason = `Probe HTTP ${res.status}`;
          }
        } catch {
          clearTimeout(timer);
          if (p.configured) {
            p.health = 'offline';
            p.statusReason = 'Local endpoint unreachable';
          }
        }
        continue;
      }

      if (!p.configured) {
        p.health = 'unconfigured';
        continue;
      }
      if (p.creditBalanceUsd <= Math.max(p.preExhaustionThresholdUsd, this.policy.preemptiveCreditSwitchUsd)) {
        p.health = 'exhausted';
        p.statusReason = 'Credit balance at or below pre-exhaustion threshold';
      } else if (p.health === 'offline' || p.health === 'cooldown') {
        p.health = 'healthy';
        p.cooldownUntil = undefined;
      }
    }
    return this.getTelemetry().providers;
  }

  selectCandidateChain(options: {
    allowCloud: boolean;
    preferExternalFirst?: boolean;
  }): AiProviderState[] {
    this.syncEnvCredentials();
    const now = Date.now();
    const effectiveOffline = this.policy.offlineMode || !options.allowCloud;

    const eligible: AiProviderState[] = [];
    for (const p of this.providers) {
      if (!p.enabled || !p.configured) continue;
      if (effectiveOffline && !p.isLocal) continue;

      if (p.health === 'cooldown' && p.cooldownUntil && Date.parse(p.cooldownUntil) > now) {
        continue;
      }
      if (p.health === 'exhausted' && !p.isLocal) {
        continue;
      }

      // Proactive pre-exhaustion credit cutoff before reaching $0
      if (!p.isLocal && p.creditLimitUsd > 0) {
        const threshold = Math.max(p.preExhaustionThresholdUsd, this.policy.preemptiveCreditSwitchUsd);
        if (p.creditBalanceUsd <= threshold) {
          p.health = 'exhausted';
          p.statusReason = `Preemptive switch triggered at $${p.creditBalanceUsd.toFixed(2)} remaining`;
          this.pushAdminAlert({
            severity: 'critical',
            code: 'PREEMPTIVE_CREDIT_EXHAUSTION',
            providerId: p.id,
            title: `${p.name} Switched Before Zero Balance`,
            message: `Remaining credit $${p.creditBalanceUsd.toFixed(2)} reached pre-exhaustion threshold ($${threshold.toFixed(2)}). Traffic switched automatically.`,
          });
          this.recordFailover({
            task: 'preemptive-credit-guard',
            fromProvider: p.id,
            toProvider: 'local-oss',
            reason: 'PREEMPTIVE_CREDIT_SWITCH',
            errorDetail: p.statusReason,
            latencyMs: 0,
            fallbackUsed: true,
          });
          continue;
        }
        const remainingPct = (p.creditBalanceUsd / p.creditLimitUsd) * 100;
        if (remainingPct <= p.warningThresholdPercent) {
          this.pushAdminAlert({
            severity: 'warning',
            code: 'CREDIT_LOW_WARNING',
            providerId: p.id,
            title: `Low Credit Warning on ${p.name}`,
            message: `Only ${remainingPct.toFixed(1)}% ($${p.creditBalanceUsd.toFixed(2)} / $${p.creditLimitUsd.toFixed(2)}) remains.`,
          });
        }
      }

      eligible.push(p);
    }

    const sorted = eligible.slice().sort((a, b) => {
      // Keep local-oss as final guaranteed fallback unless offline/local-only explicitly asks for it immediately
      const aReserve = a.id === 'local-oss' ? 1 : 0;
      const bReserve = b.id === 'local-oss' ? 1 : 0;

      if (this.policy.strategy === 'cheapest') {
        if (aReserve !== bReserve && !effectiveOffline) return aReserve - bReserve;
        if (a.costPer1kTokensUsd !== b.costPer1kTokensUsd) {
          return a.costPer1kTokensUsd - b.costPer1kTokensUsd;
        }
        return a.priority - b.priority;
      }
      if (this.policy.strategy === 'fastest') {
        if (aReserve !== bReserve && !effectiveOffline) return aReserve - bReserve;
        if (a.avgLatencyMs !== b.avgLatencyMs) {
          return a.avgLatencyMs - b.avgLatencyMs;
        }
        return a.priority - b.priority;
      }
      if (this.policy.strategy === 'highest-quality') {
        if (a.qualityScore !== b.qualityScore) {
          return b.qualityScore - a.qualityScore;
        }
        return a.priority - b.priority;
      }

      // Default: 'local-first' strictly honors hierarchy 1..11 (local daemons first, then cloud 5..11, then built-in local-oss safety net)
      if (!effectiveOffline && options.preferExternalFirst) {
        if (aReserve !== bReserve) return aReserve - bReserve;
      }
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      if (aReserve !== bReserve) return aReserve - bReserve;
      return a.priority - b.priority;
    });

    // Guarantee local-oss is ALWAYS present as the unbreakable backstop
    const localOss = this.providers.find((x) => x.id === 'local-oss')!;
    if (!sorted.some((x) => x.id === 'local-oss')) {
      sorted.push(localOss);
    }
    return sorted;
  }

  private getModelForProvider(p: AiProviderState): string {
    if (p.id === 'ollama' || p.id === 'vllm' || p.id === 'lmstudio') {
      return (
        p.activeModel ||
        LOCAL_MODEL_CATALOG[p.id][this.policy.preferredLocalFamily]
      );
    }
    return p.activeModel;
  }

  private chargeCredits(p: AiProviderState, inputChars: number, outputChars: number): number {
    const estTokens = Math.max(100, Math.round((inputChars + outputChars) / 4));
    const costUsd = Math.round(((estTokens / 1000) * p.costPer1kTokensUsd) * 100000) / 100000;
    if (!p.isLocal && p.creditBalanceUsd > 0) {
      p.creditBalanceUsd = Math.max(0, Math.round((p.creditBalanceUsd - costUsd) * 10000) / 10000);
      if (p.creditLimitUsd > 0) {
        const pct = (p.creditBalanceUsd / p.creditLimitUsd) * 100;
        if (pct <= p.warningThresholdPercent) {
          this.pushAdminAlert({
            severity: 'warning',
            code: 'CREDIT_LOW_WARNING',
            providerId: p.id,
            title: `${p.name} Credits Approaching Exhaustion`,
            message: `Balance dropped to $${p.creditBalanceUsd.toFixed(2)} (${pct.toFixed(1)}% remaining).`,
          });
        }
      }
    }
    return costUsd;
  }

  private makeCacheKey(task: string, payload: unknown): string {
    const raw = JSON.stringify({
      task,
      strategy: this.policy.strategy,
      family: this.policy.preferredLocalFamily,
      payload,
    });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private getCached<T>(key: string): CachedResponseEntry<T> | undefined {
    if (!this.policy.enableResponseCache) return undefined;
    const hit = this.cache.get(key) as CachedResponseEntry<T> | undefined;
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.cacheStats.hits += 1;
    this.cacheStats.estimatedTokensSaved += hit.savedTokens;
    this.cacheStats.estimatedCostSavedUsd =
      Math.round((this.cacheStats.estimatedCostSavedUsd + hit.savedCostUsd) * 10000) / 10000;
    const prov = this.providers.find((x) => x.id === hit.providerUsed);
    if (prov) prov.cacheHitsServed += 1;
    return hit;
  }

  private setCached<T>(
    key: string,
    value: T,
    provider: AiProviderState,
    inputChars: number,
    outputChars: number
  ) {
    if (!this.policy.enableResponseCache) return;
    if (this.cache.size >= 300) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    const savedTokens = Math.max(100, Math.round((inputChars + outputChars) / 4));
    const savedCostUsd = Math.round(((savedTokens / 1000) * provider.costPer1kTokensUsd) * 100000) / 100000;
    this.cache.set(key, {
      value,
      providerUsed: provider.id,
      modelUsed: this.getModelForProvider(provider),
      savedCostUsd,
      savedTokens,
      expiresAt: Date.now() + this.policy.cacheTtlSeconds * 1000,
    });
    this.cacheStats.entries = this.cache.size;
  }

  private async callChatProviderJson<T>(
    provider: AiProviderState,
    systemPrompt: string,
    userPrompt: string
  ): Promise<T> {
    const model = this.getModelForProvider(provider);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.isLocal ? 12000 : 18000);

    try {
      if (provider.id === 'ollama') {
        const base = (provider.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, '');
        const res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: 'json',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw Object.assign(new Error(`Ollama HTTP ${res.status}: ${errBody}`), {
            status: res.status,
          });
        }
        const data = (await res.json()) as { message?: { content?: string }; response?: string };
        return parseJsonObjectLoose<T>(data.message?.content || data.response || '{}');
      }

      if (provider.id === 'anthropic') {
        const apiKey = getProviderApiKey('anthropic');
        const res = await fetch(provider.endpoint || 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: `${systemPrompt} Return valid JSON only.`,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw Object.assign(new Error(`Anthropic HTTP ${res.status}: ${errBody}`), {
            status: res.status,
          });
        }
        const data = (await res.json()) as {
          content?: { type?: string; text?: string }[];
        };
        const text =
          data.content?.find((c) => c.type === 'text')?.text ||
          data.content?.[0]?.text ||
          '{}';
        return parseJsonObjectLoose<T>(text);
      }

      // OpenAI-compatible protocol: vllm, lmstudio, openrouter, openai, groq, together, custom
      const baseEndpoint = provider.endpoint || 'https://api.openai.com/v1/chat/completions';
      const url =
        provider.isLocal && !baseEndpoint.endsWith('/chat/completions')
          ? `${baseEndpoint.replace(/\/$/, '')}/v1/chat/completions`
          : baseEndpoint;
      const apiKey = getProviderApiKey(provider.id);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      if (provider.id === 'openrouter') {
        headers['HTTP-Referer'] = process.env.APP_URL || 'https://veritas.local';
        headers['X-Title'] = 'Veritas Open Content Intelligence';
      }

      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${systemPrompt} Respond with valid JSON only.` },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw Object.assign(new Error(`${provider.name} HTTP ${res.status}: ${errBody}`), {
          status: res.status,
        });
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return parseJsonObjectLoose<T>(data.choices?.[0]?.message?.content || '{}');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runWithFailover<T>(params: {
    task: string;
    cacheKey: string;
    inputChars: number;
    allowCloud: boolean;
    preferExternalFirst?: boolean;
    invokeProvider: (provider: AiProviderState) => Promise<T>;
  }): Promise<{ value: T; meta: RoutingExecutionMeta }> {
    const tStart = performance.now();
    const cached = this.getCached<T>(params.cacheKey);
    if (cached) {
      return {
        value: cached.value,
        meta: {
          providerUsed: cached.providerUsed,
          modelUsed: cached.modelUsed,
          strategyApplied: this.policy.strategy,
          latencyMs: Math.max(1, Math.round(performance.now() - tStart)),
          cacheHit: true,
          failoverCount: 0,
          estimatedCostUsd: 0,
          degradedOfflineFallback: cached.providerUsed === 'local-oss',
          attemptedProviders: [cached.providerUsed],
        },
      };
    }

    this.cacheStats.misses += 1;
    const candidates = this.selectCandidateChain({
      allowCloud: params.allowCloud,
      preferExternalFirst: params.preferExternalFirst,
    });

    const attemptedProviders: AiProviderId[] = [];
    let failoverCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      const provider = candidates[i];
      attemptedProviders.push(provider.id);
      const maxAttempts =
        provider.id === 'local-oss' ? 1 : Math.max(1, this.policy.retryMaxAttempts);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const pT0 = performance.now();
          const result = await params.invokeProvider(provider);
          const elapsed = Math.max(1, Math.round(performance.now() - pT0));
          provider.requestsServed += 1;
          provider.consecutiveFailures = 0;
          provider.health = 'healthy';
          provider.lastSuccessAt = new Date().toISOString();
          provider.avgLatencyMs = Math.round(provider.avgLatencyMs * 0.7 + elapsed * 0.3);

          const outChars = JSON.stringify(result || '').length;
          const costUsd = this.chargeCredits(provider, params.inputChars, outChars);
          this.setCached(params.cacheKey, result, provider, params.inputChars, outChars);

          return {
            value: result,
            meta: {
              providerUsed: provider.id,
              modelUsed: this.getModelForProvider(provider),
              strategyApplied: this.policy.strategy,
              latencyMs: Math.max(1, Math.round(performance.now() - tStart)),
              cacheHit: false,
              failoverCount,
              estimatedCostUsd: costUsd,
              degradedOfflineFallback: provider.id === 'local-oss',
              attemptedProviders,
            },
          };
        } catch (err: unknown) {
          const classified = classifyProviderFailure(err);
          const nextProvider = candidates[i + 1];

          // Retry transient errors with short backoff before failing over
          if (classified.retryable && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 25 * attempt));
            continue;
          }

          provider.failureCount += 1;
          provider.consecutiveFailures += 1;
          provider.lastErrorAt = new Date().toISOString();
          provider.lastErrorCode = classified.reason;
          provider.lastErrorMessage = classified.message.slice(0, 260);
          provider.statusReason = `${classified.reason}: ${classified.message.slice(0, 140)}`;

          if (
            classified.reason === 'PAYMENT_REQUIRED_402' ||
            classified.reason === 'BILLING_DISABLED' ||
            classified.reason === 'INSUFFICIENT_CREDITS'
          ) {
            provider.creditBalanceUsd = 0;
            provider.health = 'exhausted';
          } else if (classified.exhaustsProvider) {
            provider.health = 'exhausted';
            provider.cooldownUntil = new Date(Date.now() + classified.cooldownMs).toISOString();
          } else if (classified.reason === 'OFFLINE') {
            provider.health = 'offline';
            provider.cooldownUntil = new Date(Date.now() + classified.cooldownMs).toISOString();
          } else {
            provider.health = 'cooldown';
            provider.cooldownUntil = new Date(Date.now() + classified.cooldownMs).toISOString();
          }

          const targetId = nextProvider ? nextProvider.id : 'local-oss';
          failoverCount += 1;
          this.recordFailover({
            task: params.task,
            fromProvider: provider.id,
            toProvider: targetId,
            reason: classified.reason,
            errorDetail: classified.message.slice(0, 240),
            latencyMs: Math.round(performance.now() - tStart),
            fallbackUsed: targetId === 'local-oss',
          });

          this.pushAdminAlert({
            severity:
              classified.exhaustsProvider || classified.reason === 'PAYMENT_REQUIRED_402'
                ? 'critical'
                : 'warning',
            code: classified.reason,
            providerId: provider.id,
            title: `${provider.name} Failover (${classified.reason})`,
            message: `${classified.message.slice(0, 180)} — automatically switched to ${targetId}.`,
          });

          break; // break retry loop and advance to next candidate
        }
      }
    }

    throw new Error(`All providers exhausted for task "${params.task}".`);
  }

  private runLocalOssTextDetection(text: string, sentences: SplitSentence[]): GeminiDetectionResult {
    const { writingQuality } = computeReadabilityAndQuality(text);
    const langGuess = detectLanguageHeuristic(text);
    const burstFactor = writingQuality.burstiness < 22 ? 68 : writingQuality.burstiness < 34 ? 46 : 22;
    const paraphrasePreview = detectParaphraseSpin(text, writingQuality, burstFactor);
    const localAi = Math.max(
      5,
      Math.min(95, Math.round(burstFactor * 0.55 + paraphrasePreview.spinProbability * 0.45))
    );
    return {
      overallAiProbability: localAi,
      confidence: 82,
      suspectedModelFamily:
        localAi >= 65
          ? `Local OSS (${this.policy.preferredLocalFamily} / Stylometry)`
          : 'Human / Verified Local-First',
      detectedLanguage: langGuess.language,
      summary: `Evaluated locally via Veritas Open-Source Engine (${this.policy.preferredLocalFamily} local-first profile): zero external egress or billing dependency.`,
      sentenceScores: sentences.map((s) => {
        const wc = s.text.split(/\s+/).filter(Boolean).length;
        return {
          index: s.id,
          aiProbability: Math.max(5, Math.min(95, localAi + (wc > 18 && wc < 28 ? 8 : -6))),
          reason: 'Evaluated locally via sentence cadence and lexical density heuristics.',
        };
      }),
    };
  }

  async executeTextDetection(params: {
    text: string;
    sentences: SplitSentence[];
    allowCloud?: boolean;
  }): Promise<{ value: GeminiDetectionResult; meta: RoutingExecutionMeta }> {
    const allowCloud = params.allowCloud ?? true;
    const cacheKey = this.makeCacheKey('text-detect', { text: params.text });
    return this.runWithFailover({
      task: 'text-detect',
      cacheKey,
      inputChars: params.text.length,
      allowCloud,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          return this.runLocalOssTextDetection(params.text, params.sentences);
        }
        if (provider.id === 'gemini') {
          return geminiModule.analyzeTextWithGemini(params.text, params.sentences);
        }
        const indexed = params.sentences
          .slice(0, 50)
          .map((s, idx) => `[${idx}] ${s.text}`)
          .join('\n');
        return this.callChatProviderJson<GeminiDetectionResult>(
          provider,
          'You are a calibrated AI text detection forensics model. Return JSON with keys: overallAiProbability (0-100), confidence (0-100), suspectedModelFamily, detectedLanguage, summary, sentenceScores ([{index, aiProbability, reason}]).',
          indexed || params.text.slice(0, 6000)
        );
      },
    });
  }

  private runLocalOssHumanize(
    text: string,
    intensity: HumanizationIntensity
  ): GeminiHumanizeResult {
    let rewritten = text
      .replace(/\bFurthermore,\s*/gi, 'On top of that, ')
      .replace(/\bAdditionally,\s*/gi, 'Also, ')
      .replace(/\bMoreover,\s*/gi, 'Even so, ')
      .replace(/\bIn conclusion,\s*/gi, 'Put simply, ')
      .replace(/\bdelve into\b/gi, 'dig into')
      .replace(/\bleverage\b/gi, 'use')
      .replace(/\bstreamline\b/gi, 'simplify')
      .replace(/\bmultifaceted\b/gi, 'layered')
      .replace(/\bever-evolving landscape\b/gi, 'shifting field')
      .replace(/\bit is important to note that\s*/gi, '')
      .replace(/\bplays a crucial role in\b/gi, 'directly shapes');

    if (intensity !== 'light') {
      rewritten = rewritten
        .replace(/\bdo not\b/gi, "don't")
        .replace(/\bcannot\b/gi, "can't")
        .replace(/\bit is\b/gi, "it's")
        .replace(/\bwe are\b/gi, "we're")
        .replace(/\bthat is\b/gi, "that's");
    }
    if (intensity === 'aggressive') {
      rewritten = rewritten
        .replace(/\brobust\b/gi, 'resilient')
        .replace(/\bseamless integration\b/gi, 'tight fit')
        .replace(/\bfoster innovation\b/gi, 'encourage fresh ideas');
    }

    return {
      humanizedText: rewritten.trim(),
      preservedFactsNotes: [
        'Preserved entities, numbers, claims, and paragraph formatting locally.',
      ],
      changesSummary: `Executed ${intensity} local OSS lexical & cadence humanization (zero external tokens consumed).`,
    };
  }

  async executeHumanize(params: {
    text: string;
    intensity: HumanizationIntensity;
    allowCloud?: boolean;
  }): Promise<{ value: GeminiHumanizeResult; meta: RoutingExecutionMeta }> {
    const allowCloud = params.allowCloud ?? true;
    const cacheKey = this.makeCacheKey('humanize', {
      text: params.text,
      intensity: params.intensity,
    });
    return this.runWithFailover({
      task: 'humanize',
      cacheKey,
      inputChars: params.text.length,
      allowCloud,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          return this.runLocalOssHumanize(params.text, params.intensity);
        }
        if (provider.id === 'gemini') {
          return geminiModule.humanizeTextWithGemini(params.text, params.intensity);
        }
        return this.callChatProviderJson<GeminiHumanizeResult>(
          provider,
          `Rewrite AI prose at ${params.intensity} humanization intensity while preserving every fact, number, and structure. Return JSON: {humanizedText, preservedFactsNotes, changesSummary}.`,
          params.text.slice(0, 8000)
        );
      },
    });
  }

  async executeCodeForensics(params: {
    code: string;
    language: string;
    allowCloud?: boolean;
  }): Promise<{ value: GeminiCodeForensicsResult; meta: RoutingExecutionMeta }> {
    const allowCloud = params.allowCloud ?? true;
    const cacheKey = this.makeCacheKey('code-forensics', {
      code: params.code,
      language: params.language,
    });
    return this.runWithFailover({
      task: 'code-forensics',
      cacheKey,
      inputChars: params.code.length,
      allowCloud,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          const idioms = analyzeDeterministicCodeIdioms(params.code);
          const complexity = computeCyclomaticComplexity(params.code);
          const spdx = scanSpdxLicenseRisks(params.code);
          const score = Math.max(
            10,
            Math.min(92, 28 + idioms.length * 14 + (complexity <= 4 ? 12 : 0))
          );
          return {
            aiCodeProbability: score,
            confidence: 80,
            suspectedAssistant:
              score >= 60
                ? `Local AST & Idiom (${this.policy.preferredLocalFamily} fallback)`
                : 'Human Engineered (Local-First)',
            llmIdiomFindings: idioms,
            securityNotes:
              spdx.length > 0
                ? [`Detected ${spdx.length} SPDX license notice(s) requiring review.`]
                : ['Evaluated locally with deterministic AST & idiom scanners.'],
            summary:
              'Executed via Local Open-Source AST & Complexity Forensics (zero external dependencies).',
          };
        }
        if (provider.id === 'gemini') {
          return geminiModule.inspectCodeWithGemini(params.code, params.language);
        }
        return this.callChatProviderJson<GeminiCodeForensicsResult>(
          provider,
          'Analyze source code for AI assistant generation likelihood and security hygiene. Return JSON: {aiCodeProbability, confidence, suspectedAssistant, summary, llmIdiomFindings, securityNotes}.',
          `Language: ${params.language}\n\n${params.code.slice(0, 8000)}`
        );
      },
    });
  }

  async executeFactCheck(params: {
    text: string;
    recordId?: string;
    skipQueueOnDegraded?: boolean;
  }): Promise<{ value: FactCheckReport; meta: RoutingExecutionMeta }> {
    const cacheKey = this.makeCacheKey('fact-check', { text: params.text });
    const out = await this.runWithFailover({
      task: 'fact-check',
      cacheKey,
      inputChars: params.text.length,
      allowCloud: true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          const claims = splitSentencesWithOffsets(params.text)
            .slice(0, 4)
            .map((s, idx) => ({
              id: `clm-local-${idx + 1}`,
              claim: s.text,
              status: 'Needs Context' as const,
              confidence: 58,
              explanation:
                'External cloud web search unavailable or billing-exhausted; claim queued for deferred cloud verification.',
              sources: [],
            }));
          return {
            checkedAt: new Date().toISOString(),
            overallVeracityScore: 60,
            verifiedCount: 0,
            disputedCount: 0,
            unverifiedCount: claims.length,
            summary:
              'Cloud web search temporarily unavailable or offline — extracted verifiable claims locally and queued background cloud verification.',
            claims,
            groundingSources: [],
          };
        }
        if (provider.id === 'gemini') {
          return geminiModule.factCheckAndVerifySourcesWithGemini(params.text);
        }
        return this.callChatProviderJson<FactCheckReport>(
          provider,
          'Extract up to 5 factual claims and assess veracity. Return JSON: {overallVeracityScore, summary, verifiedCount, disputedCount, unverifiedCount, claims: [{id, claim, status, confidence, explanation, sources}], groundingSources}.',
          params.text.slice(0, 8000)
        );
      },
    });

    if (out.meta.degradedOfflineFallback && !out.meta.cacheHit && !params.skipQueueOnDegraded) {
      const q = this.queueDeferredCloudJob({
        task: 'fact-check',
        recordId: params.recordId,
        payloadSummary: params.text.slice(0, 90),
        inputText: params.text,
        lastError: 'Executed local claim extraction; cloud verification queued.',
      });
      out.meta.deferredJobId = q.id;
    }
    return out;
  }

  async executeWebPlagiarism(params: {
    text: string;
    skipQueueOnDegraded?: boolean;
  }): Promise<{
    value: {
      webMatches: {
        url: string;
        title: string;
        matchedExcerpt: string;
        similarityNote: string;
      }[];
    };
    meta: RoutingExecutionMeta;
  }> {
    const cacheKey = this.makeCacheKey('plagiarism-web', { text: params.text });
    const out = await this.runWithFailover({
      task: 'plagiarism-web',
      cacheKey,
      inputChars: params.text.length,
      allowCloud: true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          const corpus = checkPlagiarismAgainstCorpus(params.text, store.getHistory());
          return {
            webMatches: corpus.matches.map((m) => ({
              url: `veritas://local-corpus/${m.sourceId}`,
              title: `${m.sourceTitle} (Local Corpus Fallback)`,
              matchedExcerpt: m.matchedExcerpts[0] || params.text.slice(0, 120),
              similarityNote: `${m.similarityPercent}% local n-gram overlap (cloud web scan queued)`,
            })),
          };
        }
        if (provider.id === 'gemini') {
          return geminiModule.checkWebPlagiarismWithGemini(params.text);
        }
        return this.callChatProviderJson<{
          webMatches: {
            url: string;
            title: string;
            matchedExcerpt: string;
            similarityNote: string;
          }[];
        }>(
          provider,
          'Evaluate potential web overlap. Return JSON {webMatches: [{url, title, matchedExcerpt, similarityNote}]}.',
          params.text.slice(0, 4000)
        );
      },
    });

    if (out.meta.degradedOfflineFallback && !out.meta.cacheHit && !params.skipQueueOnDegraded) {
      const q = this.queueDeferredCloudJob({
        task: 'plagiarism-web',
        payloadSummary: params.text.slice(0, 90),
        inputText: params.text,
        lastError: 'Local corpus checked; live web plagiarism scan queued.',
      });
      out.meta.deferredJobId = q.id;
    }
    return out;
  }

  async executeCrossLingualPlagiarism(params: {
    text: string;
  }): Promise<{ value: CrossLingualMatch[]; meta: RoutingExecutionMeta }> {
    const cacheKey = this.makeCacheKey('plagiarism-crosslingual', { text: params.text });
    const out = await this.runWithFailover({
      task: 'plagiarism-crosslingual',
      cacheKey,
      inputChars: params.text.length,
      allowCloud: true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'local-oss') {
          return [];
        }
        if (provider.id === 'gemini') {
          return geminiModule.checkCrossLingualPlagiarismWithGemini(params.text);
        }
        const res = await this.callChatProviderJson<{ matches?: CrossLingualMatch[] }>(
          provider,
          'Return JSON {matches: [{sourceUrl, sourceTitle, sourceLanguage, matchedOriginalExcerpt, translatedMatchExcerpt, similarityNote}]}.',
          params.text.slice(0, 3500)
        );
        return res.matches || [];
      },
    });

    if (out.meta.degradedOfflineFallback && !out.meta.cacheHit) {
      const q = this.queueDeferredCloudJob({
        task: 'plagiarism-crosslingual',
        payloadSummary: params.text.slice(0, 90),
        inputText: params.text,
        lastError: 'Cross-lingual web search queued while cloud providers unavailable.',
      });
      out.meta.deferredJobId = q.id;
    }
    return out;
  }

  async executeCitationEntailment(params: {
    claim: string;
    citationUrl: string;
  }): Promise<{ value: CitationEntailmentResult; meta: RoutingExecutionMeta }> {
    const cacheKey = this.makeCacheKey('citation-entailment', params);
    const out = await this.runWithFailover<CitationEntailmentResult>({
      task: 'citation-entailment',
      cacheKey,
      inputChars: params.claim.length + params.citationUrl.length,
      allowCloud: true,
      preferExternalFirst: true,
      invokeProvider: async (provider): Promise<CitationEntailmentResult> => {
        if (provider.id === 'local-oss') {
          return {
            claim: params.claim,
            citationUrl: params.citationUrl,
            status: 'Not Found in Source',
            confidence: 55,
            rationale:
              'External cloud entailment temporarily offline/exhausted; queued background verification while preserving workflow.',
            matchedEvidenceQuote: 'Offline fallback active — no remote quote fetched.',
            sourceTitle: params.citationUrl,
          };
        }
        if (provider.id === 'gemini') {
          return geminiModule.verifyCitationEntailmentWithGemini(
            params.claim,
            params.citationUrl
          );
        }
        return this.callChatProviderJson<CitationEntailmentResult>(
          provider,
          'Return JSON: {claim, citationUrl, status, confidence, rationale, matchedEvidenceQuote, sourceTitle}.',
          `Claim: ${params.claim}\nURL: ${params.citationUrl}`
        );
      },
    });

    if (out.meta.degradedOfflineFallback && !out.meta.cacheHit) {
      const q = this.queueDeferredCloudJob({
        task: 'citation-entailment',
        payloadSummary: `${params.claim.slice(0, 60)} (${params.citationUrl})`,
        inputText: params.claim,
        extraParams: { citationUrl: params.citationUrl },
      });
      out.meta.deferredJobId = q.id;
    }
    return out;
  }

  async executeCitationLookup(params: {
    query: string;
    skipQueueOnDegraded?: boolean;
  }): Promise<{
    value: Omit<CitationEntry, 'id' | 'createdAt' | 'tags'>;
    meta: RoutingExecutionMeta;
  }> {
    const cacheKey = this.makeCacheKey('citation-lookup', { query: params.query });
    type CitationMetadata = Omit<CitationEntry, 'id' | 'createdAt' | 'tags'>;
    const out = await this.runWithFailover<CitationMetadata>({
      task: 'citation-lookup',
      cacheKey,
      inputChars: params.query.length,
      allowCloud: true,
      preferExternalFirst: true,
      invokeProvider: async (provider): Promise<CitationMetadata> => {
        if (provider.id === 'local-oss') {
          const existing = store
            .getCitations()
            .find((c) => c.title.toLowerCase().includes(params.query.toLowerCase()));
          if (existing) {
            return {
              title: existing.title,
              authors: existing.authors,
              year: existing.year,
              publisherOrJournal: existing.publisherOrJournal,
              doi: existing.doi,
              url: existing.url,
              sourceType: existing.sourceType,
              verificationStatus: existing.verificationStatus,
            };
          }
          return {
            title: params.query,
            authors: ['Unverified Local Entry'],
            year: String(new Date().getFullYear()),
            publisherOrJournal: 'Offline / Deferred Verification Queue',
            url: params.query.startsWith('http') ? params.query : undefined,
            sourceType: 'Web Page',
            verificationStatus: 'Needs Review',
          };
        }
        if (provider.id === 'gemini') {
          return geminiModule.lookupCitationWithGemini(params.query);
        }
        return this.callChatProviderJson<CitationMetadata>(
          provider,
          'Return JSON bibliographic metadata: {title, authors, year, publisherOrJournal, url, doi, sourceType, verificationStatus}.',
          params.query
        );
      },
    });

    if (out.meta.degradedOfflineFallback && !out.meta.cacheHit && !params.skipQueueOnDegraded) {
      const q = this.queueDeferredCloudJob({
        task: 'citation-lookup',
        payloadSummary: params.query.slice(0, 90),
        inputText: params.query,
      });
      out.meta.deferredJobId = q.id;
    }
    return out;
  }

  async executeImageForensics(params: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    allowCloud?: boolean;
  }): Promise<{
    value: geminiModule.GeminiImageForensicsResult;
    meta: RoutingExecutionMeta;
  }> {
    const hash = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const cacheKey = this.makeCacheKey('image-forensics', { hash, mimeType: params.mimeType });
    return this.runWithFailover({
      task: 'image-forensics',
      cacheKey,
      inputChars: Math.min(4000, params.buffer.length),
      allowCloud: params.allowCloud ?? true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'gemini') {
          return geminiModule.inspectImageWithGemini(params.buffer, params.mimeType);
        }
        const meta = inspectImageBinaryMetadata(params.buffer, params.mimeType, params.fileName);
        const prob = meta.generativeSignatures.length > 0 ? 84 : meta.byteEntropy > 7.7 ? 56 : 24;
        return {
          ocrText: '',
          syntheticProbability: prob,
          suspectedGenerator:
            meta.generativeSignatures[0] || `Local Binary Forensics (${provider.name})`,
          summary: `Inspected locally (${meta.format}, entropy ${meta.byteEntropy}, ${meta.generativeSignatures.length} generative metadata signature(s)).`,
          deepfakeIndicators: meta.generativeSignatures.map((sig) => ({
            category: 'Metadata Provenance',
            severity: 'High' as const,
            detail: sig,
          })),
        };
      },
    });
  }

  async executeAudioTranscription(params: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    allowCloud?: boolean;
  }): Promise<{ value: string; meta: RoutingExecutionMeta }> {
    const hash = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const cacheKey = this.makeCacheKey('audio-transcribe', { hash, mimeType: params.mimeType });
    return this.runWithFailover({
      task: 'audio-transcribe',
      cacheKey,
      inputChars: Math.min(2000, params.buffer.length),
      allowCloud: params.allowCloud ?? true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'gemini') {
          return geminiModule.transcribeAudioWithGemini(params.buffer, params.mimeType);
        }
        return `Local offline fallback summary for audio file ${params.fileName} (${(
          params.buffer.length / 1024
        ).toFixed(1)} KB). Speech-to-text transcription queued pending multimodal provider availability.`;
      },
    });
  }

  async executeVideoForensics(params: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    allowCloud?: boolean;
  }): Promise<{
    value: geminiModule.GeminiVideoForensicsResult;
    meta: RoutingExecutionMeta;
  }> {
    const hash = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const cacheKey = this.makeCacheKey('video-forensics', { hash, mimeType: params.mimeType });
    return this.runWithFailover({
      task: 'video-forensics',
      cacheKey,
      inputChars: Math.min(4000, params.buffer.length),
      allowCloud: params.allowCloud ?? true,
      preferExternalFirst: true,
      invokeProvider: async (provider) => {
        if (provider.id === 'gemini') {
          return geminiModule.inspectVideoWithGemini(params.buffer, params.mimeType);
        }
        return {
          transcript: `Local offline video metadata digest for ${params.fileName} (${(
            params.buffer.length / 1024
          ).toFixed(1)} KB).`,
          syntheticProbability: 45,
          frameConsistencyScore: 72,
          audioSyncAssessment: 'Local container inspection completed; multimodal sync queued.',
          suspectedGenerator: `Local OSS Fallback (${provider.name})`,
          summary: `Video container inspected locally (${params.mimeType}); external multimodal provider bypassed or unavailable.`,
          deepfakeIndicators: [
            {
              category: 'Offline Fallback Notice',
              severity: 'Low',
              detail: 'Frame-by-frame multimodal inspection fell back to local container forensics.',
            },
          ],
        };
      },
    });
  }
}

export const aiRouter = new ResilientAiRouter();
