import { useState } from 'react';
import { Check, Copy, Lock, Plus, ShieldCheck } from 'lucide-react';
import type { PrivacyRuntimeConfig, TeamUser, UserRole } from '../types/veritas.ts';

interface TeamSelfHostWorkspaceProps {
  users: TeamUser[];
  privacyConfig: PrivacyRuntimeConfig | null;
  onRefresh: () => Promise<void>;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-semibold font-mono text-slate-700 dark:text-slate-300">
          {initials || 'U'}
        </span>
      )}
    </div>
  );
}

const DOCKER_COMPOSE_SNIPPET = `services:
  veritas-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://veritas:veritas_password@postgres:5432/veritas
      - REDIS_URL=redis://redis:6379
      - OLLAMA_BASE_URL=http://ollama:11434
      - WHISPER_ASR_URL=http://whisper:9000
    depends_on:
      - postgres
      - redis
  postgres:
    image: postgres:16-alpine
    volumes:
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro
  redis:
    image: redis:7-alpine
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest
  ollama:
    image: ollama/ollama:latest`;

export function TeamSelfHostWorkspace({
  users,
  privacyConfig,
  onRefresh,
  onNotify,
}: TeamSelfHostWorkspaceProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Reviewer');
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    await fetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
    });
    setName('');
    setEmail('');
    await onRefresh();
    onNotify?.(`Added ${name.trim()} to local RBAC directory.`, 'success');
  };

  const updateRole = async (u: TeamUser, newRole: UserRole) => {
    await fetch(`/api/v1/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    await onRefresh();
    onNotify?.(`Updated ${u.name} to ${newRole}.`, 'info');
  };

  const updatePrivacy = async (patch: Partial<PrivacyRuntimeConfig>) => {
    setSavingPrivacy(true);
    try {
      await fetch('/api/v1/privacy-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await onRefresh();
      onNotify?.('Privacy airlock policy saved.', 'success');
    } finally {
      setSavingPrivacy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Team & RBAC */}
      <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Team Collaboration & Local RBAC
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage local reviewers, researchers, and administrators without external SSO lock-in.
          </p>
        </div>

        <form onSubmit={addMember} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            aria-label="Member full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="sm:col-span-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <input
            type="email"
            aria-label="Member email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@organization.local"
            className="sm:col-span-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <select
            aria-label="New member role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="sm:col-span-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-2 text-slate-900 dark:text-slate-100"
          >
            <option value="Admin">Admin</option>
            <option value="Researcher">Researcher</option>
            <option value="Reviewer">Reviewer</option>
            <option value="Viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={!name.trim() || !email.trim()}
            className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
          {users.map((u) => (
            <div key={u.id} className="p-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {u.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {u.email}
                  </div>
                </div>
              </div>

              <select
                aria-label={`Role for ${u.name}`}
                value={u.role}
                onChange={(e) => void updateRole(u, e.target.value as UserRole)}
                className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
              >
                <option value="Admin">Admin</option>
                <option value="Researcher">Researcher</option>
                <option value="Reviewer">Reviewer</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Airlock & Self-Host Stack */}
      <div className="lg:col-span-5 space-y-6">
        {privacyConfig && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Sovereign Privacy &amp; PII Airlock Policy
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Control external model egress and automated PII redaction.
                  </p>
                </div>
              </div>
              {savingPrivacy && (
                <span className="text-[11px] font-mono text-slate-500">Saving...</span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label
                  htmlFor="privacy-egress-mode"
                  className="font-medium text-slate-700 dark:text-slate-300 block"
                >
                  Processing Egress Mode
                </label>
                <select
                  id="privacy-egress-mode"
                  value={privacyConfig.mode}
                  onChange={(e) =>
                    void updatePrivacy({
                      mode: e.target.value as PrivacyRuntimeConfig['mode'],
                    })
                  }
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
                >
                  <option value="hybrid-airlock">
                    Hybrid PII Airlock (Redacts PII before LLM grounding)
                  </option>
                  <option value="local-only">
                    Strict Local-Only (100% deterministic offline heuristics; zero external egress)
                  </option>
                </select>
              </div>

              <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span className="text-slate-700 dark:text-slate-300">
                  Redact emails, phones, SSNs & API secrets before egress
                </span>
                <input
                  type="checkbox"
                  checked={privacyConfig.scrubPiiBeforeExternal}
                  onChange={(e) =>
                    void updatePrivacy({ scrubPiiBeforeExternal: e.target.checked })
                  }
                />
              </label>

              <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span className="text-slate-700 dark:text-slate-300">
                  Persist raw submitted prose in local audit store
                </span>
                <input
                  type="checkbox"
                  checked={privacyConfig.storeRawText}
                  onChange={(e) =>
                    void updatePrivacy({ storeRawText: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                MIT Open-Source & 100% Ownership
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Veritas runs without analytics beacons, third-party trackers, artificial upload limits, or subscription paywalls. Every file, report, and audit record stays under your infrastructure control.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Self-Hosted Docker Compose Blueprint
              </span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(DOCKER_COMPOSE_SNIPPET);
                  setCopiedCompose(true);
                  onNotify?.('Docker Compose YAML copied.', 'success');
                  setTimeout(() => setCopiedCompose(false), 1800);
                }}
                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {copiedCompose ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCompose ? 'Copied' : 'Copy Compose'}
              </button>
            </div>
            <pre className="p-3 rounded bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
              {DOCKER_COMPOSE_SNIPPET}
            </pre>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>Included repository deployment artifacts:</div>
            <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
              LICENSE (MIT) · Dockerfile · docker-compose.yml · schema.sql
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
