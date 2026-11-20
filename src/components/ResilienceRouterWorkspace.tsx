import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  Trash2,
  WifiOff,
  Zap,
} from 'lucide-react';
import type {
  AiProviderId,
  AiProviderState,
  AiRoutingPolicyConfig,
  AiRoutingTelemetry,
  LocalModelFamily,
  RoutingStrategy,
} from '../types/veritas.ts';

interface ResilienceRouterWorkspaceProps {
  telemetry: AiRoutingTelemetry | null;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

const STRATEGIES: { value: RoutingStrategy; label: string; desc: string }[] = [
  {
    value: 'local-first',
    label: 'Local-First (Hierarchy 1–11)',
    desc: 'Prioritize local OSS servers (Ollama, vLLM, LM Studio) before cloud providers.',
  },
  {
    value: 'cheapest',
    label: 'Cost-Optimized (Cheapest)',
    desc: 'Minimize $/1K token spend with $0 local & free-tier endpoints first.',
  },
  {
    value: 'fastest',
    label: 'Latency-Optimized (Fastest)',
    desc: 'Select the lowest observed response latency across healthy providers.',
  },
  {
    value: 'highest-quality',
    label: 'Highest Accuracy',
    desc: 'Select the highest-scoring model quality with automatic failover.',
  },
];

const MODEL_FAMILIES: { value: LocalModelFamily; label: string }[] = [
  { value: 'llama', label: 'Meta Llama (Llama 3.2 / 3.3)' },
  { value: 'qwen', label: 'Alibaba Qwen (Qwen 2.5)' },
  { value: 'deepseek', label: 'DeepSeek (R1 / V3)' },
  { value: 'mistral', label: 'Mistral AI (Mistral 7B / Small)' },
  { value: 'gemma', label: 'Google Gemma (Gemma 3)' },
];

function healthTone(health: AiProviderState['health']): string {
  if (health === 'healthy') {
    return 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30';
  }
  if (health === 'cooldown' || health === 'degraded') {
    return 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30';
  }
  if (health === 'exhausted' || health === 'offline') {
    return 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30';
  }
  return 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60';
}

export function ResilienceRouterWorkspace({
  telemetry,
  onRefresh,
  onNotify,
}: ResilienceRouterWorkspaceProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [creditFloorInput, setCreditFloorInput] = useState<string>(
    String(telemetry?.policy?.preemptiveCreditSwitchUsd ?? 0.1)
  );

  useEffect(() => {
    if (
      typeof telemetry?.policy?.preemptiveCreditSwitchUsd === 'number' &&
      Number.isFinite(telemetry.policy.preemptiveCreditSwitchUsd)
    ) {
      setCreditFloorInput(String(telemetry.policy.preemptiveCreditSwitchUsd));
    }
  }, [telemetry?.policy?.preemptiveCreditSwitchUsd]);

  if (!telemetry) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-sm text-slate-600 dark:text-slate-400">
        Loading resilient AI routing telemetry...
      </div>
    );
  }

  const { policy, providers, failoverHistory, adminAlerts, deferredQueue, cacheStats } = telemetry;

  const healthyCount = providers.filter((p) => p.enabled && p.configured && p.health === 'healthy').length;
  const unreadAlerts = adminAlerts.filter((a) => !a.acknowledged);
  const queuedCount = deferredQueue.filter((j) => j.status === 'queued' || j.status === 'retrying').length;
  const totalCacheRequests = cacheStats.hits + cacheStats.misses;
  const cacheHitRate =
    totalCacheRequests > 0 ? Math.round((cacheStats.hits / totalCacheRequests) * 100) : 0;

  const updatePolicy = async (patch: Partial<AiRoutingPolicyConfig>, label: string) => {
    setBusyAction(label);
    try {
      const res = await fetch('/api/v1/ai-routing/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed to update routing policy.');
      await onRefresh();
      onNotify(`Routing policy updated (${label}).`, 'success');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Policy update failed.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const updateProvider = async (
    id: AiProviderId,
    patch: Partial<AiProviderState>,
    label: string
  ) => {
    setBusyAction(`${id}:${label}`);
    try {
      const res = await fetch(`/api/v1/ai-routing/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed to update provider state.');
      await onRefresh();
      onNotify(`Updated provider (${label}).`, 'success');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Provider update failed.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleProbe = async () => {
    setBusyAction('probe');
    try {
      const res = await fetch('/api/v1/ai-routing/probe', { method: 'POST' });
      if (!res.ok) throw new Error('Provider health probe failed.');
      await onRefresh();
      onNotify('Probed all local inference servers and cloud credit thresholds.', 'success');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Probe failed.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAckAlerts = async (id: string) => {
    setBusyAction(`ack:${id}`);
    try {
      await fetch('/api/v1/ai-routing/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await onRefresh();
    } finally {
      setBusyAction(null);
    }
  };

  const handleReplayQueue = async () => {
    setBusyAction('replay');
    try {
      const res = await fetch('/api/v1/ai-routing/queue/process', { method: 'POST' });
      const data = (await res.json()) as { processed: number; succeeded: number; failed: number };
      await onRefresh();
      onNotify(
        `Replayed ${data.processed} queued job(s): ${data.succeeded} completed, ${data.failed} still waiting.`,
        data.succeeded > 0 ? 'success' : 'info'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearCache = async () => {
    setBusyAction('clear-cache');
    try {
      await fetch('/api/v1/ai-routing/cache', { method: 'DELETE' });
      await onRefresh();
      onNotify('Cleared SHA-256 inference response cache.', 'info');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Active Strategy</span>
            <Zap className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100 capitalize">
            {policy.offlineMode ? 'Offline Local-Only' : policy.strategy.replace('-', ' ')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Local family: <span className="font-mono uppercase">{policy.preferredLocalFamily}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Healthy Providers</span>
            <Server className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {healthyCount} / {providers.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Built-in OSS backstop active
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Response Cache</span>
            <Database className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {cacheHitRate}% hit ({cacheStats.hits})
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {cacheStats.estimatedTokensSaved.toLocaleString()} tok · ${cacheStats.estimatedCostSavedUsd.toFixed(4)} saved
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Deferred Cloud Queue</span>
            <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {queuedCount} pending
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {deferredQueue.length} total tracked jobs
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Admin Failover Alerts</span>
            <ShieldAlert className="w-3.5 h-3.5 text-red-700 dark:text-red-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {unreadAlerts.length} unread
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {failoverHistory.length} total failovers logged
          </div>
        </div>
      </div>

      {/* Policy, Local-First & Cost Optimization Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              Intelligent Routing, Local-First &amp; Cost Guardrails
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Zero downtime on HTTP 402, RESOURCE_EXHAUSTED, QUOTA_EXCEEDED, RATE_LIMIT_EXCEEDED, BILLING_DISABLED, or INSUFFICIENT_CREDITS. Server credentials remain read strictly from environment variables.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleProbe}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'probe' ? 'animate-spin' : ''}`} />
              Probe Local Servers &amp; Budgets
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleClearCache}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Cache ({cacheStats.entries})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 block">
              Model Selection Strategy
            </span>
            <select
              value={policy.strategy ?? 'local-first'}
              disabled={busyAction !== null}
              onChange={(e) =>
                void updatePolicy({ strategy: e.target.value as RoutingStrategy }, 'strategy')
              }
              className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {STRATEGIES.find((s) => s.value === policy.strategy)?.desc}
            </span>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 block">
              Preferred Local Open-Source Family
            </span>
            <select
              value={policy.preferredLocalFamily ?? 'llama'}
              disabled={busyAction !== null}
              onChange={(e) =>
                void updatePolicy(
                  { preferredLocalFamily: e.target.value as LocalModelFamily },
                  'local model family'
                )
              }
              className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            >
              {MODEL_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Auto-aligns Ollama, vLLM, LM Studio &amp; OSS fallback weights.
            </span>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 block">
              Pre-Zero Credit Switch Floor (USD)
            </span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.05}
              value={creditFloorInput}
              disabled={busyAction !== null}
              onChange={(e) => setCreditFloorInput(e.target.value)}
              onBlur={() => {
                const parsed = Number(creditFloorInput);
                const normalized = Number.isFinite(parsed)
                  ? Math.max(0, Math.min(50, parsed))
                  : policy.preemptiveCreditSwitchUsd ?? 0.1;
                setCreditFloorInput(String(normalized));
                if (normalized !== policy.preemptiveCreditSwitchUsd) {
                  void updatePolicy(
                    { preemptiveCreditSwitchUsd: normalized },
                    'credit switch threshold'
                  );
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Switches providers automatically before credits reach $0.00.
            </span>
          </label>

          <div className="space-y-2 text-xs pt-1">
            <label className="flex items-center justify-between gap-2 p-2 rounded border border-slate-200 dark:border-slate-800 cursor-pointer">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Offline Mode (Local Only)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Skip all cloud calls &amp; queue deferred web tasks
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(policy.offlineMode)}
                disabled={busyAction !== null}
                onChange={(e) =>
                  void updatePolicy({ offlineMode: e.target.checked }, 'offline mode')
                }
                className="h-4 w-4 accent-blue-700"
              />
            </label>

            <label className="flex items-center justify-between gap-2 p-2 rounded border border-slate-200 dark:border-slate-800 cursor-pointer">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  SHA-256 Response Cache
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  TTL {policy.cacheTtlSeconds}s · saves paid tokens
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(policy.enableResponseCache)}
                disabled={busyAction !== null}
                onChange={(e) =>
                  void updatePolicy({ enableResponseCache: e.target.checked }, 'response cache')
                }
                className="h-4 w-4 accent-blue-700"
              />
            </label>
          </div>
        </div>
      </section>

      {/* 11-Tier Provider Failover Hierarchy Matrix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              11-Tier Automatic Failover Hierarchy
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Tier 1–4 local OSS runtimes take precedence ahead of Tier 5–11 cloud APIs. API keys are managed exclusively via server env vars.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Tier</th>
                <th className="py-2.5 px-4 font-semibold">Provider</th>
                <th className="py-2.5 px-4 font-semibold">Health</th>
                <th className="py-2.5 px-4 font-semibold">Active Model</th>
                <th className="py-2.5 px-4 font-semibold">Cost / Latency</th>
                <th className="py-2.5 px-4 font-semibold">Credit Guardrail</th>
                <th className="py-2.5 px-4 font-semibold">Usage / Fails</th>
                <th className="py-2.5 px-4 font-semibold text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {providers.map((p) => {
                const creditPct =
                  !p.isLocal && p.creditLimitUsd > 0
                    ? Math.min(100, Math.round((p.creditBalanceUsd / p.creditLimitUsd) * 100))
                    : 100;
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      #{p.priority}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{p.name}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                            p.isLocal
                              ? 'border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {p.isLocal ? 'LOCAL' : 'CLOUD'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                        {p.statusReason ||
                          (p.configured
                            ? p.endpoint || 'Configured via server environment'
                            : 'Env credential / base URL not set')}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium uppercase ${healthTone(
                          p.health
                        )}`}
                      >
                        {p.health}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Select active model for ${p.name}`}
                        value={p.activeModel ?? p.availableModels[0] ?? ''}
                        disabled={busyAction !== null}
                        onChange={(e) =>
                          void updateProvider(p.id, { activeModel: e.target.value }, 'model')
                        }
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-[11px] font-mono max-w-[180px]"
                      >
                        {p.availableModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                      <div>${p.costPer1kTokensUsd.toFixed(4)} / 1K</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.avgLatencyMs}ms avg
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {p.isLocal ? (
                        <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                          Unlimited ($0.00)
                        </span>
                      ) : (
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-[11px] font-mono tabular-nums">
                            <span>${p.creditBalanceUsd.toFixed(2)}</span>
                            <span className="text-slate-500">${p.creditLimitUsd.toFixed(0)}</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                            <div
                              className={`h-full ${
                                creditPct <= p.warningThresholdPercent
                                  ? 'bg-red-600'
                                  : creditPct <= 35
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-600'
                              }`}
                              style={{ width: `${creditPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 dark:text-slate-100">
                        {p.requestsServed} req ({p.cacheHitsServed} cached)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.failureCount} fail{p.failureCount === 1 ? '' : 's'}
                        {p.lastErrorCode ? ` · ${p.lastErrorCode}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      {p.id !== 'local-oss' && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            void updateProvider(p.id, { enabled: !p.enabled }, 'toggle enabled')
                          }
                          className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                        >
                          {p.enabled ? 'Disable' : 'Enable'}
                        </button>
                      )}
                      {p.health !== 'healthy' && p.configured && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            void updateProvider(
                              p.id,
                              {
                                health: 'healthy',
                                creditBalanceUsd:
                                  !p.isLocal && p.creditBalanceUsd <= p.preExhaustionThresholdUsd
                                    ? Math.max(10, p.creditLimitUsd || 25)
                                    : undefined,
                              },
                              'recover'
                            )
                          }
                          className="px-2 py-1 text-[11px] rounded bg-blue-700 hover:bg-blue-800 text-white cursor-pointer disabled:opacity-50"
                        >
                          Recover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Split: Admin Alerts + Offline Deferred Queue & Failover History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Administrator Notifications */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Administrator Failover &amp; Credit Notifications
            </h3>
            {unreadAlerts.length > 0 && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAckAlerts('all')}
                className="text-xs text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Acknowledge All ({unreadAlerts.length})
              </button>
            )}
          </div>

          {adminAlerts.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              All configured providers operating normally. No billing or quota alerts triggered.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {adminAlerts.slice(0, 15).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded border text-xs flex items-start justify-between gap-3 ${
                    alert.acknowledged
                      ? 'border-slate-200 dark:border-slate-800 opacity-70'
                      : alert.severity === 'critical'
                        ? 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20'
                        : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{alert.title}</span>
                      <span className="font-mono text-[10px] text-slate-500">{alert.code}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{alert.message}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      {new Date(alert.timestamp).toLocaleString()}
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <button
                      type="button"
                      onClick={() => void handleAckAlerts(alert.id)}
                      className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                    >
                      Ack
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Deferred Cloud Queue & Recent Failovers */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              Offline Deferred Cloud Queue &amp; Failover Trace
            </h3>
            {deferredQueue.length > 0 && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleReplayQueue}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                Replay Queue ({queuedCount})
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {deferredQueue.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded p-3">
                No deferred cloud jobs queued. When external search or cloud inference is offline, jobs queue here automatically for replay without blocking users.
              </div>
            ) : (
              deferredQueue.slice(0, 10).map((job) => (
                <div
                  key={job.id}
                  className="p-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {job.task} · {job.payloadSummary}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {job.resultSummary || job.lastError || `Attempts: ${job.attempts}`}
                    </div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono uppercase rounded border shrink-0 ${
                      job.status === 'completed'
                        ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400'
                        : 'border-amber-200 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Recent Automatic Failover Transitions
            </div>
            {failoverHistory.length === 0 ? (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                No failovers recorded yet in this runtime session.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {failoverHistory.slice(0, 12).map((ev) => (
                  <div
                    key={ev.id}
                    className="text-[11px] flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800/70 last:border-0"
                  >
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                      {ev.fromProvider} &rarr; {ev.toProvider} ({ev.task})
                    </span>
                    <span className="font-mono text-amber-700 dark:text-amber-400 shrink-0">
                      {ev.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
