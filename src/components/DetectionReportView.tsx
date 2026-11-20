import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react';
import type {
  DetectionRecord,
  ExclusionFilters,
  FilteredScoreResult,
  SentenceAnalysis,
  TeamUser,
} from '../types/veritas.ts';
import {
  exportRecordCsv,
  exportRecordDocx,
  exportRecordJson,
  exportRecordPdf,
  exportRecordTxt,
} from '../utils/exportClient.ts';

interface DetectionReportViewProps {
  record: DetectionRecord;
  users: TeamUser[];
  onHumanizeText: (text: string, recordId: string) => void;
  onAddComment: (recordId: string, text: string, userId: string) => Promise<void>;
  onRecordUpdated?: (updated: DetectionRecord) => void;
}

function verdictStyle(verdict: DetectionRecord['verdict']) {
  if (verdict === 'AI-Generated') {
    return {
      text: 'text-red-700 dark:text-red-400',
      bar: 'bg-red-600 dark:bg-red-500',
    };
  }
  if (verdict === 'Mixed') {
    return {
      text: 'text-amber-700 dark:text-amber-400',
      bar: 'bg-amber-600 dark:bg-amber-500',
    };
  }
  return {
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
  };
}

export function DetectionReportView({
  record,
  users,
  onHumanizeText,
  onAddComment,
  onRecordUpdated,
}: DetectionReportViewProps) {
  const [selectedSentence, setSelectedSentence] = useState<SentenceAnalysis | null>(
    record.sentences[0] || null
  );
  const [activeSubTab, setActiveSubTab] = useState<
    'sentences' | 'quality' | 'factcheck' | 'seo' | 'academic' | 'media' | 'comments'
  >(record.mediaForensics ? 'media' : 'sentences');
  const [copied, setCopied] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [factCheckBusy, setFactCheckBusy] = useState(false);
  const [webPlagBusy, setWebPlagBusy] = useState(false);
  const [seoTargetKw, setSeoTargetKw] = useState(record.seoAnalysis?.targetKeyword || '');
  const [seoBusy, setSeoBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [exFilters, setExFilters] = useState<ExclusionFilters>({
    excludeQuotes: false,
    excludeBibliography: false,
    excludeHeaders: false,
    minMatchWords: 5,
  });
  const [filteredScores, setFilteredScores] = useState<FilteredScoreResult | null>(null);
  const [filterBusy, setFilterBusy] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [commentAuthorId, setCommentAuthorId] = useState(users[0]?.id || 'usr-elena');
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    setSelectedSentence(record.sentences[0] || null);
    setActiveSubTab(record.mediaForensics ? 'media' : 'sentences');
    setSeoTargetKw(record.seoAnalysis?.targetKeyword || '');
    setFilteredScores(null);
    setActionError(null);
  }, [record.id]);

  const style = verdictStyle(record.verdict);
  const authScore = record.authenticity?.overallScore ?? Math.round(100 - record.aiProbability);
  const qualityScore = record.contentQuality?.overallScore ?? record.writingQuality.overall;
  const seoScore = record.seoAnalysis?.overallScore ?? 0;
  const integrityScore = record.academicIntegrity?.integrityScore ?? Math.round(100 - record.aiProbability);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(record.fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDocx = async () => {
    setExportBusy('docx');
    try {
      await exportRecordDocx(record, false);
    } finally {
      setExportBusy(null);
    }
  };

  const handleRunFactCheck = async () => {
    setFactCheckBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/v1/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: record.fullText, recordId: record.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fact-check failed.');
      if (data.updatedRecord && onRecordUpdated) {
        onRecordUpdated(data.updatedRecord as DetectionRecord);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Fact-check failed.');
    } finally {
      setFactCheckBusy(false);
    }
  };

  const handleRunWebPlagiarism = async () => {
    setWebPlagBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/v1/plagiarism-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: record.fullText, recordId: record.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Web plagiarism check failed.');
      if (data.updatedRecord && onRecordUpdated) {
        onRecordUpdated(data.updatedRecord as DetectionRecord);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Web plagiarism check failed.');
    } finally {
      setWebPlagBusy(false);
    }
  };

  const handleRunSeoKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeoBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/v1/seo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: record.fullText,
          title: record.title,
          targetKeyword: seoTargetKw,
          recordId: record.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SEO audit failed.');
      if (data.updatedRecord && onRecordUpdated) {
        onRecordUpdated(data.updatedRecord as DetectionRecord);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'SEO audit failed.');
    } finally {
      setSeoBusy(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentBusy(true);
    try {
      await onAddComment(record.id, commentText.trim(), commentAuthorId);
      setCommentText('');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleRecalculateExclusions = async (nextFilters: ExclusionFilters) => {
    setExFilters(nextFilters);
    setFilterBusy(true);
    try {
      const res = await fetch('/api/v1/exclusions/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: record.id, filters: nextFilters }),
      });
      if (res.ok) {
        const data = (await res.json()) as FilteredScoreResult;
        setFilteredScores(data);
      }
    } finally {
      setFilterBusy(false);
    }
  };

  const dist = record.readability.sentenceDistribution || {
    short: 0,
    medium: 0,
    long: 0,
    veryLong: 0,
  };
  const maxDist = Math.max(1, dist.short, dist.medium, dist.long, dist.veryLong);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
      {/* Header & Unified Content Intelligence Scoreboard */}
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">
                {record.sourceType}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {new Date(record.createdAt).toLocaleString()}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{record.wordCount} words</span>
              <span aria-hidden="true">·</span>
              <span>
                {record.detectedLanguage} ({record.languageConfidence}%)
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
              {record.title}
            </h2>
            {record.routingMeta && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                <span>
                  Engine: <strong className="text-slate-700 dark:text-slate-300">{record.routingMeta.providerUsed}</strong> ({record.routingMeta.modelUsed})
                </span>
                <span aria-hidden="true">·</span>
                <span>Strategy: {record.routingMeta.strategyApplied}</span>
                {record.routingMeta.cacheHit && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400">Cache Hit ($0.00)</span>
                  </>
                )}
                {record.routingMeta.failoverCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-amber-400">
                      Auto-Failover ({record.routingMeta.failoverCount})
                    </span>
                  </>
                )}
                {record.routingMeta.deferredJobId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-700 dark:text-blue-400">
                      Cloud Replay Queued ({record.routingMeta.deferredJobId})
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onHumanizeText(record.fullText, record.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Humanize Content
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Text'}
            </button>
          </div>
        </div>

        {/* Ecosystem Metrics Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 items-center">
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-semibold ${style.text}`}>
                {record.verdict}
              </span>
              <span className="text-sm font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {record.aiProbability}% AI / {record.humanProbability}% Human
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden flex">
              <div
                className={`${style.bar} h-full transition-all duration-300`}
                style={{ width: `${Math.min(100, Math.max(0, record.aiProbability))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Signal: {record.suspectedModelFamily}</span>
              <span className="font-mono tabular-nums">
                Confidence {record.confidence}%
              </span>
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-5 gap-4 lg:pl-6 lg:border-l border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Authenticity</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {authScore}/100
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {record.authenticity?.grade || 'Evaluated'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Content Quality</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {qualityScore}/100
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {record.contentQuality?.detectedTone || 'Neutral'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">SEO Score</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {seoScore}/100
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {record.seoAnalysis?.searchIntent || 'Informational'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Readability</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                Gr {record.readability.fleschKincaidGrade}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                FRE {record.readability.fleschReadingEase}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Integrity</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {integrityScore}/100
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {record.academicIntegrity?.riskLevel || 'Evaluated'}
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {record.summary}
        </p>

        {(record.adversarialSecurity?.evasionDetected ||
          record.paraphraseSpin?.classification === 'AI-Paraphrased / Spun') && (
          <div className="p-3 rounded border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="text-amber-800 dark:text-amber-300 space-y-0.5">
              {record.adversarialSecurity?.evasionDetected && (
                <div>
                  <strong>Adversarial Firewall Normalized:</strong>{' '}
                  {record.adversarialSecurity.normalizedDiffSummary}
                </div>
              )}
              {record.paraphraseSpin?.classification === 'AI-Paraphrased / Spun' && (
                <div>
                  <strong>AI-Paraphrase Spin Detected ({record.paraphraseSpin.spinProbability}%):</strong>{' '}
                  {record.paraphraseSpin.aiVocabularyHits.length > 0
                    ? `AI-cliché hits: ${record.paraphraseSpin.aiVocabularyHits.join(', ')}`
                    : record.paraphraseSpin.indicators[0]}
                </div>
              )}
            </div>
            {record.adversarialSecurity && record.adversarialSecurity.piiDetectedCount > 0 && (
              <span className="font-mono tabular-nums text-amber-800 dark:text-amber-300">
                PII Airlock scrubbed {record.adversarialSecurity.piiDetectedCount} token(s)
              </span>
            )}
          </div>
        )}

        {/* Export Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Download className="w-3.5 h-3.5" />
            <span>Export Intelligence Report:</span>
            <button
              type="button"
              onClick={() => exportRecordPdf(record)}
              className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer"
            >
              PDF
            </button>
            <button
              type="button"
              onClick={handleDocx}
              disabled={exportBusy === 'docx'}
              className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer disabled:opacity-50"
            >
              {exportBusy === 'docx' ? 'Exporting...' : 'DOCX'}
            </button>
            <button
              type="button"
              onClick={() => exportRecordTxt(record, false)}
              className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer"
            >
              TXT
            </button>
            <button
              type="button"
              onClick={() => exportRecordJson(record)}
              className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer"
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => exportRecordCsv([record])}
              className="px-2.5 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded transition-colors cursor-pointer"
            >
              CSV
            </button>
          </div>

          {record.sourceUrl && (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-700 dark:text-blue-400 hover:underline truncate max-w-xs"
            >
              Source: {record.sourceUrl}
            </a>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div
        role="tablist"
        aria-label="Intelligence report sections"
        className="px-4 sm:px-6 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        {[
          { id: 'sentences', label: `Sentence Highlights (${record.sentences.length})` },
          { id: 'quality', label: 'Quality & Readability' },
          {
            id: 'factcheck',
            label: record.factCheck
              ? `Fact Check (${record.factCheck.overallVeracityScore}%)`
              : 'Fact Check & Sources',
          },
          { id: 'seo', label: `SEO & GEO (${seoScore}% / ${record.geoAnalysis?.geoScore ?? 0}%)` },
          {
            id: 'academic',
            label: `Academic & Plagiarism`,
          },
          ...(record.mediaForensics
            ? [{ id: 'media', label: 'Media Forensics' }]
            : []),
          { id: 'comments', label: `Team Notes (${record.comments.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeSubTab === tab.id}
            onClick={() =>
              setActiveSubTab(
                tab.id as
                  | 'sentences'
                  | 'quality'
                  | 'factcheck'
                  | 'seo'
                  | 'academic'
                  | 'media'
                  | 'comments'
              )
            }
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab Body */}
      <div className="p-5 sm:p-6">
        {actionError && (
          <div
            role="alert"
            className="mb-4 p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            {actionError}
          </div>
        )}

        {activeSubTab === 'sentences' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
                <span>Select any highlighted sentence to inspect its forensic reasoning:</span>
                <span className="text-red-700 dark:text-red-400 font-medium">
                  High AI Likelihood (≥65%)
                </span>
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  Mixed / Uncertain (40–64%)
                </span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Human (&lt;40%)
                </span>
              </div>

              <div className="text-[15px] leading-7 text-slate-800 dark:text-slate-200 space-y-1">
                {record.sentences.map((s) => {
                  const isSelected = selectedSentence?.id === s.id;
                  const highlightClass =
                    s.aiProbability >= 65
                      ? 'bg-red-500/14 dark:bg-red-500/20 text-slate-900 dark:text-slate-100'
                      : s.aiProbability >= 40
                        ? 'bg-amber-500/14 dark:bg-amber-500/20 text-slate-900 dark:text-slate-100'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800';

                  return (
                    <span
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Sentence ${s.id + 1}, ${s.aiProbability}% AI probability, ${s.label}`}
                      onClick={() => setSelectedSentence(s)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedSentence(s);
                        }
                      }}
                      className={`inline cursor-pointer rounded px-1 py-0.5 mr-1 transition-colors ${highlightClass} ${
                        isSelected ? 'ring-2 ring-blue-600 dark:ring-blue-400' : ''
                      }`}
                    >
                      {s.text}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4 lg:border-l border-slate-200 dark:border-slate-800 lg:pl-6 space-y-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Sentence & Authenticity Inspector
              </div>
              {selectedSentence ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Sentence #{selectedSentence.id + 1} · {selectedSentence.label}
                    </span>
                    <span className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {selectedSentence.aiProbability}% AI
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 leading-relaxed">
                    “{selectedSentence.text}”
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Perplexity Proxy</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {selectedSentence.perplexityProxy}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Word Count</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {selectedSentence.wordCount}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      Reasoning:{' '}
                    </span>
                    {selectedSentence.reason}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Select a sentence to inspect details.</p>
              )}

              {record.authenticity && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    Authenticity Breakdown ({record.authenticity.overallScore}/100)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    {record.authenticity.rationale}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'quality' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Content Quality Dimensions
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {[
                    ['Overall Content Quality', `${qualityScore} / 100`],
                    ['Depth & Specificity', `${record.contentQuality?.depthAndSpecificity ?? qualityScore} / 100`],
                    ['Evidence & Citation Density', `${record.contentQuality?.evidenceDensity ?? 50} / 100`],
                    ['Coherence & Narrative Flow', `${record.contentQuality?.coherenceAndFlow ?? record.writingQuality.clarity} / 100`],
                    ['Tone & Register Consistency', `${record.contentQuality?.toneConsistency ?? 80} / 100`],
                    ['Argument Strength', `${record.contentQuality?.argumentStrength ?? 70} / 100`],
                    ['Sentence Burstiness (CV)', `${record.writingQuality.burstiness}%`],
                    ['Type-Token Ratio (TTR)', `${record.writingQuality.typeTokenRatio}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-2">
                      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {val}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Readability Indices ({record.readability.targetAudience})
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {[
                    ['Flesch Reading Ease', `${record.readability.fleschReadingEase} / 100`],
                    ['Flesch-Kincaid Grade', `${record.readability.fleschKincaidGrade}`],
                    ['Coleman-Liau Index', `${record.readability.colemanLiauIndex}`],
                    ['Automated Readability Index', `${record.readability.automatedReadabilityIndex}`],
                    ['Gunning Fog Index', `${record.readability.gunningFog}`],
                    ['SMOG Index', `${record.readability.smogIndex}`],
                    ['Passive Voice Ratio', `${record.readability.passiveVoicePercent}%`],
                    ['Reading Time', `${record.readability.readingTimeMinutes} min`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-2">
                      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {val}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sentence Complexity Distribution
                </h4>
                <div className="space-y-2 text-xs">
                  {[
                    ['Short (≤10 words)', dist.short],
                    ['Medium (11–20 words)', dist.medium],
                    ['Long (21–30 words)', dist.long],
                    ['Very Long (>30 words)', dist.veryLong],
                  ].map(([lbl, count]) => (
                    <div key={lbl as string} className="grid grid-cols-12 items-center gap-3">
                      <span className="col-span-5 sm:col-span-4 text-slate-600 dark:text-slate-400 truncate">
                        {lbl}
                      </span>
                      <div className="col-span-5 sm:col-span-6 h-2 bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-blue-700 dark:bg-blue-500"
                          style={{ width: `${((count as number) / maxDist) * 100}%` }}
                        />
                      </div>
                      <span className="col-span-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {record.contentQuality && (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      Observed Strengths
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                      {record.contentQuality.strengths.map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      Editorial Recommendations
                    </div>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                      {record.contentQuality.recommendations.map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {record.paraphraseSpin && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      AI-Paraphrase & Spin Classifier
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {record.paraphraseSpin.classification} ({record.paraphraseSpin.spinProbability}%)
                    </span>
                  </div>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {record.paraphraseSpin.indicators.map((ind, i) => (
                      <li key={i}>· {ind}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Overrepresented AI Vocabulary Hits ({record.paraphraseSpin.aiVocabularyHits.length})
                  </div>
                  <p className="font-mono text-slate-600 dark:text-slate-300">
                    {record.paraphraseSpin.aiVocabularyHits.length > 0
                      ? record.paraphraseSpin.aiVocabularyHits.join(' · ')
                      : 'No hallmark LLM cliché vocabulary detected.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'factcheck' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Fact-Checking & Source Verification
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Extracts verifiable factual claims and cross-checks them against live web search grounding.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunFactCheck}
                disabled={factCheckBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {factCheckBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Verifying Claims...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {record.factCheck ? 'Re-Verify Claims via Web Search' : 'Verify Claims via Web Search'}
                  </>
                )}
              </button>
            </div>

            {record.factCheck ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                  <div>
                    <div className="text-xs text-slate-500">Veracity Score</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {record.factCheck.overallVeracityScore}/100
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Verified</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {record.factCheck.verifiedCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Disputed</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-red-700 dark:text-red-400">
                      {record.factCheck.disputedCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Grounding Sources</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {record.factCheck.groundingSources.length}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {record.factCheck.summary}
                </p>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                  {record.factCheck.claims.map((c) => (
                    <div key={c.id} className="p-4 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`font-semibold ${
                            c.status === 'Verified'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : c.status === 'Disputed'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {c.status}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          Confidence {c.confidence}%
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.claim}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{c.explanation}</p>
                      {c.sources.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-1">
                          {c.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>{src.domain}</span>
                              <span className="text-slate-400">({src.credibilityTier})</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded text-xs text-slate-500 dark:text-slate-400">
                Click &ldquo;Verify Claims via Web Search&rdquo; to extract factual claims and verify source credibility in real time.
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'seo' && record.seoAnalysis && (
          <div className="space-y-6">
            <form
              onSubmit={handleRunSeoKeyword}
              className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800"
            >
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Intent: <strong>{record.seoAnalysis.searchIntent}</strong> · Avg Paragraph:{' '}
                <span className="font-mono tabular-nums">{record.seoAnalysis.avgParagraphWords} words</span> · Headings:{' '}
                <span className="font-mono tabular-nums">{record.seoAnalysis.headingCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Target SEO keyword"
                  value={seoTargetKw ?? ''}
                  onChange={(e) => setSeoTargetKw(e.target.value)}
                  placeholder="Target SEO keyword..."
                  className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={seoBusy}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {seoBusy ? 'Auditing...' : 'Audit Keyword'}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="p-4 rounded border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] text-slate-500">SERP Snippet Preview</div>
                  <div className="text-base font-medium text-blue-700 dark:text-blue-400">
                    {record.seoAnalysis.suggestedTitle}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {record.seoAnalysis.suggestedMetaDescription}...
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                  {record.seoAnalysis.checklist.map((item, i) => (
                    <div key={i} className="p-3 flex items-start gap-2.5 text-xs">
                      {item.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.label}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">{item.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-5">
                {record.geoAnalysis && (
                  <div className="p-4 rounded border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Generative Engine Optimization (GEO)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                        {record.geoAnalysis.geoScore}/100
                      </span>
                    </div>
                    <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        ['Entity Density', `${record.geoAnalysis.entityDensityScore}/100`],
                        ['Direct-Answer Readiness', `${record.geoAnalysis.directAnswerReadiness}/100`],
                        ['Schema / Fact Structure', `${record.geoAnalysis.schemaReadiness}/100`],
                        ['AI Citation Worthiness', `${record.geoAnalysis.citationWorthinessScore}/100`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1.5">
                          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                          <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Top Extracted Keywords & Density
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 px-3 font-medium">Keyword</th>
                        <th className="py-2 px-3 font-medium text-right">Count</th>
                        <th className="py-2 px-3 font-medium text-right">Density</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {record.seoAnalysis.topKeywords.map((kw) => (
                        <tr key={kw.keyword}>
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {kw.keyword}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {kw.count}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                            {kw.densityPercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'academic' && (
          <div className="space-y-6">
            {record.academicIntegrity && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Academic Integrity Audit
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        record.academicIntegrity.riskLevel === 'Low Risk'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : record.academicIntegrity.riskLevel === 'Moderate Risk'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {record.academicIntegrity.riskLevel} ({record.academicIntegrity.integrityScore}/100)
                    </span>
                  </div>
                  <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {[
                      ['AI Assistance Risk', `${record.academicIntegrity.aiAssistanceRisk}%`],
                      ['Paraphrase Integrity', `${record.academicIntegrity.paraphraseIntegrityScore}%`],
                      ['Citation Coverage Score', `${record.academicIntegrity.citationCoverageScore}%`],
                      ['Inline Citations Detected', `${record.academicIntegrity.inlineCitationCount}`],
                      ['Uncited Empirical Claims', `${record.academicIntegrity.uncitedClaimCount}`],
                      ['Academic Register Score', `${record.academicIntegrity.academicRegisterScore}/100`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between py-2">
                        <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                        <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="space-y-3 text-xs">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                    Integrity Findings & Next Steps
                  </h4>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                    {record.academicIntegrity.findings.map((f, i) => (
                      <li key={i}>· {f}</li>
                    ))}
                  </ul>
                  {record.academicIntegrity.recommendations.length > 0 && (
                    <div className="pt-2">
                      <div className="font-medium text-slate-800 dark:text-slate-200 mb-1">
                        Recommended Review Actions
                      </div>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                        {record.academicIntegrity.recommendations.map((rec, i) => (
                          <li key={i}>· {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Interactive Similarity & AI Exclusion Filters
                </span>
                {filterBusy && (
                  <span className="text-slate-500 font-mono">Recalculating...</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(exFilters.excludeQuotes)}
                    onChange={(e) =>
                      void handleRecalculateExclusions({
                        ...exFilters,
                        excludeQuotes: e.target.checked,
                      })
                    }
                  />
                  Exclude Direct Quotes
                </label>
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(exFilters.excludeBibliography)}
                    onChange={(e) =>
                      void handleRecalculateExclusions({
                        ...exFilters,
                        excludeBibliography: e.target.checked,
                      })
                    }
                  />
                  Exclude Bibliography / References
                </label>
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(exFilters.excludeHeaders)}
                    onChange={(e) =>
                      void handleRecalculateExclusions({
                        ...exFilters,
                        excludeHeaders: e.target.checked,
                      })
                    }
                  />
                  Exclude Short Headers
                </label>
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span>Min N-gram Words:</span>
                  <select
                    value={exFilters.minMatchWords ?? 5}
                    onChange={(e) =>
                      void handleRecalculateExclusions({
                        ...exFilters,
                        minMatchWords: Number(e.target.value),
                      })
                    }
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 font-mono"
                  >
                    {[3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} words
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filteredScores && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    Adjusted AI: <strong>{filteredScores.adjustedAiProbability}%</strong> · Adjusted Similarity:{' '}
                    <strong>{filteredScores.adjustedPlagiarismPercent}%</strong>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {filteredScores.note}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Plagiarism: Local Corpus & Live Web Check
                  </h3>
                  <button
                    type="button"
                    onClick={handleRunWebPlagiarism}
                    disabled={webPlagBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {webPlagBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    {webPlagBusy ? 'Scanning Web...' : 'Scan Live Web'}
                  </button>
                </div>

                {record.plagiarism.matches.length === 0 &&
                (!record.plagiarism.webMatches || record.plagiarism.webMatches.length === 0) ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No 5-gram overlaps found in your local corpus. Run &ldquo;Scan Live Web&rdquo; to cross-check distinctive excerpts against indexed web sources.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                    {record.plagiarism.matches.map((m) => (
                      <div key={m.sourceId} className="p-3 space-y-1 text-xs">
                        <div className="flex justify-between font-medium">
                          <span className="text-slate-900 dark:text-slate-100 truncate">
                            {m.sourceTitle}
                          </span>
                          <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                            {m.similarityPercent}% corpus match
                          </span>
                        </div>
                      </div>
                    ))}
                    {(record.plagiarism.webMatches || []).map((wm, idx) => (
                      <div key={idx} className="p-3 space-y-1 text-xs">
                        <a
                          href={wm.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {wm.title}
                        </a>
                        <div className="text-slate-600 dark:text-slate-300 italic">
                          “{wm.matchedExcerpt}”
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">{wm.similarityNote}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Active Plugin Findings
                </h3>
                {record.pluginFindings.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No custom or built-in plugins triggered.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                    {record.pluginFindings.map((pf) => (
                      <div key={pf.pluginId} className="p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {pf.pluginName}
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              pf.triggered
                                ? 'text-red-700 dark:text-red-400 font-medium'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {pf.triggered
                              ? `Triggered (${pf.scoreDelta >= 0 ? '+' : ''}${pf.scoreDelta})`
                              : 'Clear'}
                          </span>
                        </div>
                        {pf.findings.length > 0 && (
                          <div className="text-slate-600 dark:text-slate-300">
                            {pf.findings.join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'media' && record.mediaForensics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Binary Metadata & File Inspection
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {record.mediaForensics.format} · Entropy {record.mediaForensics.byteEntropy} bits/byte
                </span>
              </div>

              {record.mediaForensics.dimensions && (
                <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                  Dimensions: {record.mediaForensics.dimensions.width} ×{' '}
                  {record.mediaForensics.dimensions.height} px
                </div>
              )}

              {record.mediaForensics.generativeSignatures.length > 0 && (
                <div className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 space-y-1">
                  <div className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Generative Metadata Signatures Detected
                  </div>
                  {record.mediaForensics.generativeSignatures.map((sig, i) => (
                    <div key={i} className="text-xs text-slate-700 dark:text-slate-300">
                      {sig}
                    </div>
                  ))}
                </div>
              )}

              <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs border border-slate-200 dark:border-slate-800 rounded">
                {Object.entries(record.mediaForensics.metadataTags).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-3 p-2.5">
                    <dt className="font-medium text-slate-600 dark:text-slate-400 truncate">
                      {k}
                    </dt>
                    <dd className="col-span-2 font-mono text-slate-900 dark:text-slate-100 break-words">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Deepfake Indicators & Extracted Content
              </h3>

              {record.mediaForensics.audioSyncAssessment && (
                <div className="text-xs p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Audio-Visual Sync Assessment
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {record.mediaForensics.audioSyncAssessment}
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                {record.mediaForensics.deepfakeIndicators.map((ind, idx) => (
                  <div key={idx} className="p-3 space-y-1 text-xs">
                    <div className="flex justify-between font-medium">
                      <span className="text-slate-900 dark:text-slate-100">{ind.category}</span>
                      <span
                        className={
                          ind.severity === 'High'
                            ? 'text-red-700 dark:text-red-400'
                            : ind.severity === 'Medium'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {ind.severity} Severity
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{ind.detail}</p>
                  </div>
                ))}
              </div>

              {(record.mediaForensics.ocrText || record.mediaForensics.transcript) && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    {record.mediaForensics.ocrText ? 'Extracted OCR Text' : 'Audio/Video Transcript'}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {record.mediaForensics.ocrText || record.mediaForensics.transcript}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'comments' && (
          <div className="space-y-5 max-w-2xl">
            <form onSubmit={handlePostComment} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Add Collaboration Review Note
                </label>
                <select
                  aria-label="Review note author"
                  value={commentAuthorId || users[0]?.id || ''}
                  onChange={(e) => setCommentAuthorId(e.target.value)}
                  className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={commentText ?? ''}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
                placeholder="Document manual verification notes, source provenance, or editorial feedback..."
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md p-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
              <button
                type="submit"
                disabled={commentBusy || !commentText.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-50 cursor-pointer"
              >
                {commentBusy ? 'Posting...' : 'Post Review Note'}
              </button>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
              {record.comments.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No review notes posted yet.</p>
              ) : (
                record.comments.map((c) => (
                  <div key={c.id} className="py-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {c.userName}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400">{c.userRole}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {record.humanizedVersions && record.humanizedVersions.length > 0 && (
        <div className="px-6 py-4 bg-slate-50/60 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>
              Latest Humanized Revision ({record.humanizedVersions[0].intensity}):{' '}
              <strong className="font-mono tabular-nums">
                {record.humanizedVersions[0].originalAiScore}% →{' '}
                {record.humanizedVersions[0].recheckAiScore}% AI
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => exportRecordTxt(record, true)}
            className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Download Humanized TXT
          </button>
        </div>
      )}
    </div>
  );
}
