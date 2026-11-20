import { useMemo, useState } from 'react';
import { Archive, Download, Search, Trash2 } from 'lucide-react';
import type {
  AnalyticsSummary,
  AuditLogEntry,
  DetectionRecord,
  SourceType,
} from '../types/veritas.ts';
import { exportBulkZip, exportRecordCsv } from '../utils/exportClient.ts';

interface HistoryAnalyticsWorkspaceProps {
  records: DetectionRecord[];
  analytics: AnalyticsSummary | null;
  auditLogs: AuditLogEntry[];
  onInspectRecord: (record: DetectionRecord) => void;
  onDeleteRecord: (id: string) => Promise<void>;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

export function HistoryAnalyticsWorkspace({
  records,
  analytics,
  auditLogs,
  onInspectRecord,
  onDeleteRecord,
  onNotify,
}: HistoryAnalyticsWorkspaceProps) {
  const [subView, setSubView] = useState<'history' | 'audit'>('history');
  const [query, setQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'All' | 'Human' | 'Mixed' | 'AI-Generated'>('All');
  const [sourceFilter, setSourceFilter] = useState<'All' | SourceType>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (verdictFilter !== 'All' && r.verdict !== verdictFilter) return false;
      if (sourceFilter !== 'All' && r.sourceType !== sourceFilter) return false;
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !r.fullText.toLowerCase().includes(q) &&
        !(r.sourceUrl || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [records, query, verdictFilter, sourceFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllVisible = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const sourceEntries = analytics
    ? (Object.entries(analytics.bySourceType) as [SourceType, number][])
    : [];
  const maxSourceCount = Math.max(1, ...sourceEntries.map(([, c]) => c));

  return (
    <div className="space-y-6">
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Intelligence Scans',
              value: analytics.totalScans.toLocaleString(),
              sub: `${analytics.totalWordsAnalyzed.toLocaleString()} words analyzed`,
            },
            {
              label: 'Mean Authenticity Index',
              value: `${analytics.avgAuthenticityScore}/100`,
              sub: `Mean AI Probability ${analytics.avgAiProbability}%`,
            },
            {
              label: 'Mean Quality & SEO',
              value: `${analytics.avgQualityScore} / ${analytics.avgSeoScore}`,
              sub: `Quality score / SEO readiness`,
            },
            {
              label: 'Humanization Passes',
              value: analytics.humanizationCount.toLocaleString(),
              sub: `Avg reduction -${analytics.avgHumanizationReduction}% AI score`,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {kpi.value}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recent Scan Volume & Mean AI Score
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {analytics.recentTrend.length} active day(s)
              </span>
            </div>
            {analytics.recentTrend.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-400 py-8">No scan data recorded yet.</p>
            ) : (
              <div className="space-y-2.5 pt-2">
                {analytics.recentTrend.map((day) => (
                  <div key={day.date} className="grid grid-cols-12 items-center gap-2 sm:gap-3 text-xs">
                    <span className="col-span-4 sm:col-span-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate">
                      {day.date}
                    </span>
                    <div className="col-span-4 sm:col-span-6 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-blue-700 dark:bg-blue-500"
                        style={{ width: `${Math.min(100, day.avgAiScore)}%` }}
                      />
                    </div>
                    <span className="col-span-4 sm:col-span-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {day.scans} · {day.avgAiScore}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Modality Distribution
            </h3>
            <div className="space-y-2.5 pt-2">
              {sourceEntries.map(([src, count]) => (
                <div key={src} className="grid grid-cols-12 items-center gap-3 text-xs">
                  <span className="col-span-4 sm:col-span-3 capitalize text-slate-600 dark:text-slate-300">
                    {src}
                  </span>
                  <div className="col-span-6 sm:col-span-7 h-2 bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-slate-700 dark:bg-slate-400"
                      style={{ width: `${(count / maxSourceCount) * 100}%` }}
                    />
                  </div>
                  <span className="col-span-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="History and audit views"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'history'}
              onClick={() => setSubView('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Intelligence History ({records.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'audit'}
              onClick={() => setSubView('audit')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'audit'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Audit Logs ({auditLogs.length})
            </button>
          </div>

          {subView === 'history' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  exportRecordCsv(
                    selectedIds.length > 0
                      ? records.filter((r) => selectedIds.includes(r.id))
                      : filtered
                  );
                  onNotify?.('CSV report downloaded.', 'success');
                }}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  exportBulkZip(
                    selectedIds.length > 0
                      ? selectedIds
                      : filtered.map((r) => r.id)
                  );
                  onNotify?.('Bulk ZIP archive requested.', 'success');
                }}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Archive className="w-3.5 h-3.5" />
                Bulk ZIP ({selectedIds.length > 0 ? selectedIds.length : filtered.length})
              </button>
            </div>
          )}
        </div>

        {subView === 'history' ? (
          <div>
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Filter detection history by title, URL, or content"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by title, URL, or content..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                />
              </div>
              <select
                aria-label="Filter by verdict"
                value={verdictFilter}
                onChange={(e) =>
                  setVerdictFilter(
                    e.target.value as 'All' | 'Human' | 'Mixed' | 'AI-Generated'
                  )
                }
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
              >
                <option value="All">All Verdicts</option>
                <option value="AI-Generated">AI-Generated</option>
                <option value="Mixed">Mixed</option>
                <option value="Human">Human</option>
              </select>
              <select
                aria-label="Filter by content modality"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'All' | SourceType)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
              >
                <option value="All">All Modalities</option>
                <option value="text">Text</option>
                <option value="document">Document</option>
                <option value="url">URL</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-600 dark:text-slate-400">
                No matching detection records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all visible records"
                          checked={
                            filtered.length > 0 && selectedIds.length === filtered.length
                          }
                          onChange={toggleAllVisible}
                        />
                      </th>
                      <th className="py-2.5 px-4 font-medium">Title / Source</th>
                      <th className="py-2.5 px-4 font-medium">Modality</th>
                      <th className="py-2.5 px-4 font-medium text-right">Authenticity</th>
                      <th className="py-2.5 px-4 font-medium text-right">Quality</th>
                      <th className="py-2.5 px-4 font-medium text-right">AI Score</th>
                      <th className="py-2.5 px-4 font-medium">Verdict</th>
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2.5 px-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.title}`}
                            checked={selectedIds.includes(r.id)}
                            onChange={() => toggleSelect(r.id)}
                          />
                        </td>
                        <td className="py-2.5 px-4 max-w-xs truncate">
                          <button
                            type="button"
                            onClick={() => onInspectRecord(r)}
                            className="text-left font-medium text-slate-900 dark:text-slate-100 truncate max-w-full cursor-pointer hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            {r.title}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300">
                          {r.sourceType}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {r.authenticity?.overallScore ?? '—'}/100
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {r.contentQuality?.overallScore ?? r.writingQuality.overall}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {r.aiProbability}%
                        </td>
                        <td className="py-2.5 px-4 font-medium">
                          <span
                            className={
                              r.verdict === 'AI-Generated'
                                ? 'text-red-700 dark:text-red-400'
                                : r.verdict === 'Mixed'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {r.verdict}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectRecord(r)}
                            className="text-blue-700 dark:text-blue-400 font-medium hover:underline mr-3 cursor-pointer"
                          >
                            Open
                          </button>
                          {confirmDeleteId === r.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  void onDeleteRecord(r.id).then(() => {
                                    setConfirmDeleteId(null);
                                    onNotify?.(`Deleted "${r.title}".`, 'info');
                                  });
                                }}
                                className="px-2 py-0.5 text-[11px] font-medium bg-red-700 hover:bg-red-800 text-white rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(r.id)}
                              className="text-slate-500 hover:text-red-600 cursor-pointer inline-flex items-center p-1"
                              aria-label={`Delete ${r.title}`}
                              title="Delete record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Actor</th>
                  <th className="py-2.5 px-4 font-medium">Action</th>
                  <th className="py-2.5 px-4 font-medium">Target</th>
                  <th className="py-2.5 px-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {log.actorName} ({log.actorRole})
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                      {log.target}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {log.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
