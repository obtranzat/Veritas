import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Code2,
  FileSearch,
  Fingerprint,
  Globe,
  HelpCircle,
  Info,
  KeyRound,
  Layers,
  Menu,
  Moon,
  Plus,
  ScanEye,
  Search,
  ShieldCheck,
  Sun,
  TrendingUp,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { AnalyzerWorkspace } from './components/AnalyzerWorkspace.tsx';

const AcademicCitationsWorkspace = lazy(() =>
  import('./components/AcademicCitationsWorkspace.tsx').then((m) => ({
    default: m.AcademicCitationsWorkspace,
  }))
);
const ApiPluginsWorkspace = lazy(() =>
  import('./components/ApiPluginsWorkspace.tsx').then((m) => ({
    default: m.ApiPluginsWorkspace,
  }))
);
const BatchQueueWorkspace = lazy(() =>
  import('./components/BatchQueueWorkspace.tsx').then((m) => ({
    default: m.BatchQueueWorkspace,
  }))
);
const CodeForensicsWorkspace = lazy(() =>
  import('./components/CodeForensicsWorkspace.tsx').then((m) => ({
    default: m.CodeForensicsWorkspace,
  }))
);
const FactSourceWorkspace = lazy(() =>
  import('./components/FactSourceWorkspace.tsx').then((m) => ({
    default: m.FactSourceWorkspace,
  }))
);
const HistoryAnalyticsWorkspace = lazy(() =>
  import('./components/HistoryAnalyticsWorkspace.tsx').then((m) => ({
    default: m.HistoryAnalyticsWorkspace,
  }))
);
const HumanizerWorkspace = lazy(() =>
  import('./components/HumanizerWorkspace.tsx').then((m) => ({
    default: m.HumanizerWorkspace,
  }))
);
const LinkCrawlerWorkspace = lazy(() =>
  import('./components/LinkCrawlerWorkspace.tsx').then((m) => ({
    default: m.LinkCrawlerWorkspace,
  }))
);
const MediaForensicsWorkspace = lazy(() =>
  import('./components/MediaForensicsWorkspace.tsx').then((m) => ({
    default: m.MediaForensicsWorkspace,
  }))
);
const ProvenanceAuthWorkspace = lazy(() =>
  import('./components/ProvenanceAuthWorkspace.tsx').then((m) => ({
    default: m.ProvenanceAuthWorkspace,
  }))
);
const SeoQualityWorkspace = lazy(() =>
  import('./components/SeoQualityWorkspace.tsx').then((m) => ({
    default: m.SeoQualityWorkspace,
  }))
);
const TeamSelfHostWorkspace = lazy(() =>
  import('./components/TeamSelfHostWorkspace.tsx').then((m) => ({
    default: m.TeamSelfHostWorkspace,
  }))
);
const ResilienceRouterWorkspace = lazy(() =>
  import('./components/ResilienceRouterWorkspace.tsx').then((m) => ({
    default: m.ResilienceRouterWorkspace,
  }))
);
import type {
  AiRoutingTelemetry,
  AnalyticsSummary,
  ApiKeyRecord,
  AuditLogEntry,
  AuthorStylometricProfile,
  CitationEntry,
  CodeAnalysisReport,
  DetectionRecord,
  PluginConfig,
  PrivacyRuntimeConfig,
  QueueJob,
  TeamUser,
  VeritasProofBundle,
} from './types/veritas.ts';

type WorkspaceTab =
  | 'analyzer'
  | 'factcheck'
  | 'seo'
  | 'academic'
  | 'code'
  | 'provenance'
  | 'batch'
  | 'crawler'
  | 'media'
  | 'humanizer'
  | 'history'
  | 'api'
  | 'resilience'
  | 'team';

interface NavItem {
  id: WorkspaceTab;
  label: string;
  breadcrumb: string;
  keywords: string;
  icon: typeof FileSearch;
}

const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Core Forensics',
    items: [
      { id: 'analyzer', label: 'Intelligence Hub', breadcrumb: 'Content Intelligence & Authenticity', keywords: 'detect text pdf docx upload highlight', icon: FileSearch },
      { id: 'batch', label: 'Batch Queue', breadcrumb: 'Unlimited Batch Queue', keywords: 'bulk files queue concurrent zip', icon: Layers },
      { id: 'crawler', label: 'Link Crawler', breadcrumb: 'Web Link Detection', keywords: 'url crawl website scrape page', icon: Globe },
      { id: 'media', label: 'Media Forensics', breadcrumb: 'Image, Audio & Video', keywords: 'ocr deepfake spectrogram exif whisper', icon: ScanEye },
    ],
  },
  {
    heading: 'Quality & Research',
    items: [
      { id: 'humanizer', label: 'Humanizer', breadcrumb: 'Humanization Engine', keywords: 'rewrite paraphrase bypass light moderate aggressive', icon: Wand2 },
      { id: 'factcheck', label: 'Fact & Source Lab', breadcrumb: 'Fact Checking, Entailment & Cross-Lingual', keywords: 'claim verify entailment cross-lingual plagiarism', icon: ShieldCheck },
      { id: 'seo', label: 'SEO, GEO & Quality', breadcrumb: 'SEO, GEO & Readability Studio', keywords: 'keyword serp readability generative engine optimization', icon: TrendingUp },
      { id: 'academic', label: 'Academic & Citations', breadcrumb: 'Academic Integrity & Citations', keywords: 'apa mla chicago ieee bibtex doi paper', icon: BookOpen },
    ],
  },
  {
    heading: 'Security & Provenance',
    items: [
      { id: 'code', label: 'Code & Security', breadcrumb: 'Code AI, AST, SPDX & Adversarial Firewall', keywords: 'ast spdx license firewall pii zero-width homoglyph', icon: Code2 },
      { id: 'provenance', label: 'Provenance & Auth', breadcrumb: 'Veritas Proof & Stylometric Twin', keywords: 'ed25519 signature badge svg stylometry drift', icon: Fingerprint },
    ],
  },
  {
    heading: 'Platform & Governance',
    items: [
      { id: 'history', label: 'History & Audit', breadcrumb: 'Analytics, History & Audit', keywords: 'analytics export csv audit log delete', icon: BarChart3 },
      { id: 'api', label: 'API, MCP & LTI', breadcrumb: 'REST API, Plugins, MCP & LTI 1.3', keywords: 'openapi swagger bearer key plugin mcp canvas moodle', icon: KeyRound },
      { id: 'resilience', label: 'AI Failover & Local', breadcrumb: 'Resilient Multi-Provider & Local OSS Router', keywords: 'failover ollama vllm lmstudio openrouter llama qwen deepseek credit quota offline', icon: Activity },
      { id: 'team', label: 'Privacy & Team', breadcrumb: 'Privacy Airlock, RBAC & Docker Stack', keywords: 'local-only airlock rbac docker self-host team', icon: Users },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

const WORKSPACE_SEO_META: Record<WorkspaceTab, { title: string; description: string }> = {
  analyzer: {
    title: 'Veritas — Open-Source AI Detector & Content Intelligence',
    description:
      'Free self-hosted AI content detector, authenticity grader, readability scorer, and document forensics workbench with zero usage or upload limits.',
  },
  batch: {
    title: 'Batch File AI Detection Queue — Veritas Open-Source',
    description:
      'Analyze unlimited PDF, DOCX, TXT, image, audio, and video files simultaneously with live SSE progress and bulk ZIP/DOCX exports.',
  },
  crawler: {
    title: 'Web Link AI Content Crawler — Veritas Open-Source',
    description:
      'Crawl 1-10 same-origin web pages with SSRF protection to detect AI-generated articles and audit on-page SEO and GEO signals.',
  },
  media: {
    title: 'Image, Audio & Video Deepfake & OCR Forensics — Veritas',
    description:
      'Analyze images (EXIF/OCR), audio, and video transcriptions for synthetic AI signals using local Whisper and multimodal forensics.',
  },
  humanizer: {
    title: 'Open-Source AI Humanizer & Re-Checker — Veritas',
    description:
      'Humanize AI-flagged prose at light, moderate, or aggressive levels while preserving facts and automatically re-verifying against AI detection.',
  },
  factcheck: {
    title: 'Fact-Checking, Citation Entailment & Plagiarism — Veritas',
    description:
      'Verify factual claims, check citation entailment, and run web and cross-lingual plagiarism audits on self-hosted infrastructure.',
  },
  seo: {
    title: 'SEO, GEO & 6-Formula Readability Studio — Veritas',
    description:
      'Audit SERP snippets, entity density, Generative Engine Optimization (GEO), and 6 academic readability formulas offline.',
  },
  academic: {
    title: 'Academic Integrity & Citations Vault — Veritas',
    description:
      'Generate APA, MLA, Chicago, IEEE, and BibTeX citations alongside paraphrase integrity and exclusion filter scoring.',
  },
  code: {
    title: 'AI Code Detector, AST Fingerprinting & Security — Veritas',
    description:
      'Detect LLM-generated source code, compute variable-rename-invariant AST fingerprints, audit SPDX licenses, and strip adversarial smuggling.',
  },
  provenance: {
    title: 'Ed25519 Proofs & Author Stylometric Twin — Veritas',
    description:
      'Mint cryptographic Ed25519 human-authorship proofs and self-hosted SVG verification badges with privacy-safe stylometry.',
  },
  history: {
    title: 'Detection Analytics, Audit Logs & Bulk Exports — Veritas',
    description:
      'Review scan history, platform authenticity analytics, immutable security audit trails, and DOCX/CSV/JSON/ZIP exports.',
  },
  api: {
    title: 'OpenAPI 3.1 REST, MCP & LTI 1.3 LMS Integrations — Veritas',
    description:
      'Manage SHA-256 bearer API keys, ReDoS-safe regex plugins, Model Context Protocol tools, and Canvas/Moodle LTI 1.3.',
  },
  resilience: {
    title: '11-Tier AI Failover & Local Ollama/vLLM Router — Veritas',
    description:
      'Zero-downtime local-first routing across Ollama, vLLM, LM Studio, OpenRouter, Gemini, OpenAI, Anthropic, Groq, and Together AI.',
  },
  team: {
    title: 'Privacy Airlock, PII Redaction & Self-Hosted RBAC — Veritas',
    description:
      'Configure strict local-only mode, outbound PII Airlock scrubbing, role-based access control, and GDPR erasure.',
  },
};

function resolveInitialWorkspace(): WorkspaceTab {
  if (typeof window === 'undefined') return 'analyzer';
  const param = new URLSearchParams(window.location.search).get('workspace');
  if (param && ALL_NAV_ITEMS.some((item) => item.id === param)) {
    return param as WorkspaceTab;
  }
  return 'analyzer';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(resolveInitialWorkspace);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [records, setRecords] = useState<DetectionRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<DetectionRecord | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [plugins, setPlugins] = useState<PluginConfig[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [activeReviewerId, setActiveReviewerId] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [citations, setCitations] = useState<CitationEntry[]>([]);
  const [codeReports, setCodeReports] = useState<CodeAnalysisReport[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<AuthorStylometricProfile[]>([]);
  const [proofs, setProofs] = useState<VeritasProofBundle[]>([]);
  const [privacyConfig, setPrivacyConfig] = useState<PrivacyRuntimeConfig | null>(null);
  const [routingTelemetry, setRoutingTelemetry] = useState<AiRoutingTelemetry | null>(null);

  const [humanizerSeedText, setHumanizerSeedText] = useState('');
  const [humanizerRecordId, setHumanizerRecordId] = useState<string | undefined>(undefined);

  // Global Quick Search (Cmd/Ctrl+K), Help Guide & Toast state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'success' | 'info' | 'error';
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback(
    (message: string, tone: 'success' | 'info' | 'error' = 'info') => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ message, tone });
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
    },
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    const meta = WORKSPACE_SEO_META[activeTab] || WORKSPACE_SEO_META.analyzer;
    document.title = meta.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', meta.description);
    const url = new URL(window.location.href);
    if (activeTab === 'analyzer') {
      url.searchParams.delete('workspace');
    } else {
      url.searchParams.set('workspace', activeTab);
    }
    window.history.replaceState(null, '', url.toString());
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHelpOpen(false);
        setSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setHelpOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 30);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  const refreshAll = useCallback(async () => {
    try {
      setLoadError(null);
      const responses = await Promise.all([
        fetch('/api/v1/history'),
        fetch('/api/v1/analytics'),
        fetch('/api/v1/jobs'),
        fetch('/api/v1/keys'),
        fetch('/api/v1/plugins'),
        fetch('/api/v1/users'),
        fetch('/api/v1/audit-logs'),
        fetch('/api/v1/citations'),
        fetch('/api/v1/code-reports'),
        fetch('/api/v1/authorship/profiles'),
        fetch('/api/v1/proofs'),
        fetch('/api/v1/privacy-config'),
        fetch('/api/v1/ai-routing/status'),
      ]);

      const parsed = await Promise.all(
        responses.map(async (r) => {
          if (!r.ok) return null;
          try {
            return await r.json();
          } catch {
            return null;
          }
        })
      );
      const [hData, aData, jData, kData, pData, uData, lData, cData, crData, apData, prData, pcData, rtData] =
        parsed;

      const nextRecords = Array.isArray(hData) ? (hData as DetectionRecord[]) : [];
      const nextUsers = Array.isArray(uData) ? (uData as TeamUser[]) : [];
      if (Array.isArray(hData)) {
        setRecords(nextRecords);
        setActiveRecord((prev) =>
          prev ? nextRecords.find((r) => r.id === prev.id) || nextRecords[0] || null : nextRecords[0] || null
        );
      }
      if (aData && typeof aData === 'object' && 'totalScans' in aData) {
        setAnalytics(aData as AnalyticsSummary);
      }
      if (Array.isArray(jData)) setJobs(jData as QueueJob[]);
      if (Array.isArray(kData)) setApiKeys(kData as ApiKeyRecord[]);
      if (Array.isArray(pData)) setPlugins(pData as PluginConfig[]);
      if (Array.isArray(uData)) {
        setUsers(nextUsers);
        setActiveReviewerId((prev) => prev || nextUsers[0]?.id || '');
      }
      if (Array.isArray(lData)) setAuditLogs(lData as AuditLogEntry[]);
      if (Array.isArray(cData)) setCitations(cData as CitationEntry[]);
      if (Array.isArray(crData)) setCodeReports(crData as CodeAnalysisReport[]);
      if (Array.isArray(apData)) setAuthorProfiles(apData as AuthorStylometricProfile[]);
      if (Array.isArray(prData)) setProofs(prData as VeritasProofBundle[]);
      if (pcData && typeof pcData === 'object' && 'mode' in pcData) {
        setPrivacyConfig(pcData as PrivacyRuntimeConfig);
      }
      if (rtData && Array.isArray((rtData as AiRoutingTelemetry).providers)) {
        setRoutingTelemetry(rtData as AiRoutingTelemetry);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to local Veritas API node.'
      );
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleRecordCreated = (record: DetectionRecord) => {
    setActiveRecord(record);
    void refreshAll();
  };

  const handleRecordUpdated = (updated: DetectionRecord) => {
    setActiveRecord(updated);
    void refreshAll();
  };

  const handleJobUpdated = (job: QueueJob) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [job, ...prev];
      const next = [...prev];
      next[idx] = job;
      return next;
    });
    if (job.status === 'completed' || job.status === 'failed') {
      void refreshAll();
    }
  };

  const handleHumanizeTransfer = (text: string, recordId: string) => {
    setHumanizerSeedText(text);
    setHumanizerRecordId(recordId);
    setActiveTab('humanizer');
  };

  const handleAddComment = async (
    recordId: string,
    text: string,
    userId: string
  ) => {
    const res = await fetch(`/api/v1/history/${recordId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, userId: userId || activeReviewerId }),
    });
    if (res.ok) {
      const updated = (await res.json()) as DetectionRecord;
      setActiveRecord((prev) => (prev?.id === updated.id ? updated : prev));
      await refreshAll();
      notify('Review comment saved.', 'success');
    }
  };

  const handleDeleteRecord = async (id: string) => {
    await fetch(`/api/v1/history/${id}`, { method: 'DELETE' });
    if (activeRecord?.id === id) setActiveRecord(null);
    await refreshAll();
  };

  const handleInspectRecordId = (recordId: string) => {
    const found = records.find((r) => r.id === recordId);
    if (found) {
      setActiveRecord(found);
      setActiveTab('analyzer');
    }
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchedTabs = ALL_NAV_ITEMS.filter(
      (item) =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.breadcrumb.toLowerCase().includes(q) ||
        item.keywords.includes(q)
    ).slice(0, 6);

    const matchedRecords = records
      .filter(
        (r) =>
          !q ||
          r.title.toLowerCase().includes(q) ||
          r.sourceType.toLowerCase().includes(q) ||
          (r.sourceUrl || '').toLowerCase().includes(q)
      )
      .slice(0, 5);

    const matchedCode = codeReports
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.language.toLowerCase().includes(q))
      .slice(0, 3);

    const matchedProofs = proofs
      .filter(
        (p) =>
          !q ||
          p.documentTitle.toLowerCase().includes(q) ||
          p.proofId.toLowerCase().includes(q)
      )
      .slice(0, 3);

    return { matchedTabs, matchedRecords, matchedCode, matchedProofs };
  }, [searchQuery, records, codeReports, proofs]);

  const currentNav = ALL_NAV_ITEMS.find((n) => n.id === activeTab) || ALL_NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:bg-blue-700 focus:text-white focus:rounded"
      >
        Skip to main workspace
      </a>

      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
        />
      )}

      <aside
        aria-label="Primary workspace navigation"
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="overflow-y-auto flex-1">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('analyzer');
                setMobileNavOpen(false);
              }}
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
            >
              Veritas
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-3 space-y-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.heading} className="space-y-1">
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {section.heading}
                </div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2.5">
          {users.length > 0 && (
            <div className="space-y-1">
              <label
                htmlFor="active-reviewer-select"
                className="text-[11px] text-slate-500 dark:text-slate-400 block"
              >
                Active Local Identity
              </label>
              <select
                id="active-reviewer-select"
                value={activeReviewerId ?? ''}
                onChange={(e) => {
                  setActiveReviewerId(e.target.value);
                  const chosen = users.find((u) => u.id === e.target.value);
                  if (chosen) notify(`Switched identity to ${chosen.name} (${chosen.role}).`, 'info');
                }}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-800 dark:text-slate-200"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.role}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              MIT · Self-Hosted
            </span>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help Guide
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>Veritas</span>
              <span aria-hidden="true">/</span>
              <h1 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {currentNav.breadcrumb}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {routingTelemetry && routingTelemetry.adminAlerts.some((a) => !a.acknowledged) && (
              <button
                type="button"
                onClick={() => setActiveTab('resilience')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {routingTelemetry.adminAlerts.filter((a) => !a.acknowledged).length} Failover Alert
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Quick search tools and records (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden md:inline font-mono text-[10px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={darkMode ? 'Switch to light color theme' : 'Switch to dark color theme'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRecord(null);
                setActiveTab('analyzer');
              }}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Analysis</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-[1360px] w-full mx-auto focus:outline-none"
        >
          {loadError && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
            >
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void refreshAll()}
                className="font-medium underline cursor-pointer shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {loadingInitial ? (
            <div className="space-y-4">
              <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
              <div className="h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'analyzer' && (
                <AnalyzerWorkspace
                  users={users}
                  activeRecord={activeRecord}
                  onRecordCreated={handleRecordCreated}
                  onRecordUpdated={handleRecordUpdated}
                  onHumanizeText={handleHumanizeTransfer}
                  onAddComment={handleAddComment}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab !== 'analyzer' && (
                <Suspense
                  fallback={
                    <div
                      aria-busy="true"
                      aria-label="Loading workspace module"
                      className="space-y-4"
                    >
                      <div className="h-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
                      <div className="h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
                    </div>
                  }
                >
                  {activeTab === 'factcheck' && (
                    <FactSourceWorkspace
                      records={records}
                      onRecordUpdated={refreshAll}
                    />
                  )}

                  {activeTab === 'seo' && (
                    <SeoQualityWorkspace
                      records={records}
                      onRecordCreatedOrUpdated={handleRecordCreated}
                    />
                  )}

                  {activeTab === 'academic' && (
                    <AcademicCitationsWorkspace
                      records={records}
                      citations={citations}
                      onRefreshCitations={refreshAll}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'code' && (
                    <CodeForensicsWorkspace
                      codeReports={codeReports}
                      onRefresh={refreshAll}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'provenance' && (
                    <ProvenanceAuthWorkspace
                      authorProfiles={authorProfiles}
                      proofs={proofs}
                      onRefresh={refreshAll}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'batch' && (
                    <BatchQueueWorkspace
                      jobs={jobs}
                      records={records}
                      onJobUpdated={handleJobUpdated}
                      onInspectRecordId={handleInspectRecordId}
                    />
                  )}

                  {activeTab === 'crawler' && (
                    <LinkCrawlerWorkspace
                      users={users}
                      onPagesAnalyzed={() => void refreshAll()}
                      onRecordUpdated={handleRecordUpdated}
                      onHumanizeText={handleHumanizeTransfer}
                      onAddComment={handleAddComment}
                    />
                  )}

                  {activeTab === 'media' && (
                    <MediaForensicsWorkspace
                      users={users}
                      onRecordCreated={handleRecordCreated}
                      onRecordUpdated={handleRecordUpdated}
                      onHumanizeText={handleHumanizeTransfer}
                      onAddComment={handleAddComment}
                    />
                  )}

                  {activeTab === 'humanizer' && (
                    <HumanizerWorkspace
                      initialText={humanizerSeedText}
                      initialRecordId={humanizerRecordId}
                      records={records}
                      onRevisionSaved={() => void refreshAll()}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'history' && (
                    <HistoryAnalyticsWorkspace
                      records={records}
                      analytics={analytics}
                      auditLogs={auditLogs}
                      onInspectRecord={(r) => {
                        setActiveRecord(r);
                        setActiveTab('analyzer');
                      }}
                      onDeleteRecord={handleDeleteRecord}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'api' && (
                    <ApiPluginsWorkspace
                      apiKeys={apiKeys}
                      plugins={plugins}
                      onRefresh={refreshAll}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'resilience' && (
                    <ResilienceRouterWorkspace
                      telemetry={routingTelemetry}
                      onRefresh={refreshAll}
                      onNotify={notify}
                    />
                  )}

                  {activeTab === 'team' && (
                    <TeamSelfHostWorkspace
                      users={users}
                      privacyConfig={privacyConfig}
                      onRefresh={refreshAll}
                      onNotify={notify}
                    />
                  )}
                </Suspense>
              )}
            </>
          )}
        </main>
      </div>

      {/* Global Quick Search & Jump Modal (Cmd/Ctrl+K) */}
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick search tools and records"
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-start justify-center pt-16 sm:pt-24 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search workspaces, scan history, code reports, or proofs"
                value={searchQuery ?? ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Jump to workspace, scan record, proof ID, or code report..."
                className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {searchResults.matchedTabs.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Workspaces
                  </div>
                  {searchResults.matchedTabs.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setSearchOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                          <Icon className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                          {item.label}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">
                          {item.breadcrumb}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {searchResults.matchedRecords.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Saved Detection Scans
                  </div>
                  {searchResults.matchedRecords.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => {
                        setActiveRecord(rec);
                        setActiveTab('analyzer');
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {rec.title}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {rec.aiProbability}% AI · {rec.sourceType}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {(searchResults.matchedCode.length > 0 || searchResults.matchedProofs.length > 0) && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Code Audits &amp; Ed25519 Proofs
                  </div>
                  {searchResults.matchedCode.map((cr) => (
                    <button
                      key={cr.id}
                      type="button"
                      onClick={() => {
                        setActiveTab('code');
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {cr.title}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {cr.language} · {cr.aiCodeProbability}% AI
                      </span>
                    </button>
                  ))}
                  {searchResults.matchedProofs.map((pr) => (
                    <button
                      key={pr.proofId}
                      type="button"
                      onClick={() => {
                        setActiveTab('provenance');
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {pr.documentTitle}
                      </span>
                      <span className="font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
                        {pr.proofId}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.matchedTabs.length === 0 &&
                searchResults.matchedRecords.length === 0 &&
                searchResults.matchedCode.length === 0 &&
                searchResults.matchedProofs.length === 0 && (
                  <div className="p-6 text-center text-slate-600 dark:text-slate-400">
                    No matching workspaces, scans, or proofs found for &ldquo;{searchQuery}&rdquo;.
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Help & Keyboard Guide Modal */}
      {helpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Veritas Help & Architecture Guide"
          onClick={() => setHelpOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Veritas Quick Guide &amp; Keyboard Shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close help dialog"
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Keyboard Shortcuts
                </div>
                <ul className="space-y-1 font-mono text-[11px]">
                  <li>Cmd/Ctrl + K · Open quick search across tools, history &amp; proofs</li>
                  <li>Esc · Dismiss open dialogs or mobile drawer</li>
                  <li>Tab / Enter · Navigate &amp; inspect highlighted sentences or upload dropzones</li>
                </ul>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Privacy Egress Modes (Privacy &amp; Team)
                </div>
                <p>
                  Choose <strong>Strict Local-Only</strong> for zero outbound network calls using deterministic heuristics, AST, and stylometry—or <strong>Hybrid PII Airlock</strong> to redact emails, phones, SSNs, and API keys before external grounding.
                </p>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  No Usage Limits or Paywalls
                </div>
                <p>
                  Unlimited batch queues, Ed25519 cryptographic proofs, SVG badges, OpenAPI 3.1 endpoints, MCP tools, and LTI 1.3 LMS integration are enabled locally without subscriptions.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Global Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 rounded-md px-3.5 py-2.5 shadow-lg flex items-center gap-2 text-xs"
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
