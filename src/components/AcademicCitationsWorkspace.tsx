import { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  CitationEntry,
  CitationStyle,
  DetectionRecord,
} from '../types/veritas.ts';
import {
  exportCitationsBibtex,
  exportRecordPdf,
  formatCitation,
} from '../utils/exportClient.ts';

interface AcademicCitationsWorkspaceProps {
  records: DetectionRecord[];
  citations: CitationEntry[];
  onRefreshCitations: () => Promise<void>;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

export function AcademicCitationsWorkspace({
  records,
  citations,
  onRefreshCitations,
  onNotify,
}: AcademicCitationsWorkspaceProps) {
  const [selectedRecordId, setSelectedRecordId] = useState(records[0]?.id || '');
  const [style, setStyle] = useState<CitationStyle>('APA');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Grounded citation resolver
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Manual citation entry
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [publisher, setPublisher] = useState('');
  const [doi, setDoi] = useState('');
  const [url, setUrl] = useState('');

  const selectedRecord =
    records.find((r) => r.id === selectedRecordId) || records[0] || null;

  const handleResolveAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const res = await fetch('/api/v1/citations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lookupQuery.trim() }),
      });
      const resolved = await res.json();
      if (!res.ok) throw new Error(resolved.error || 'Citation lookup failed.');

      const saveRes = await fetch('/api/v1/citations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resolved,
          linkedRecordId: selectedRecord?.id,
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save resolved citation.');
      setLookupQuery('');
      await onRefreshCitations();
      onNotify?.('Source verified and saved to bibliography vault.', 'success');
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch('/api/v1/citations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        authors: authors
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        year: year.trim() || String(new Date().getFullYear()),
        publisherOrJournal: publisher.trim() || 'Independent Publication',
        doi: doi.trim() || undefined,
        url: url.trim() || undefined,
        sourceType: doi.trim() ? 'Journal Article' : 'Web Page',
        verificationStatus: 'Verified Source',
      }),
    });
    setTitle('');
    setAuthors('');
    setPublisher('');
    setDoi('');
    setUrl('');
    await onRefreshCitations();
    onNotify?.('Reference added to bibliography vault.', 'success');
  };

  const handleDeleteCitation = async (id: string) => {
    await fetch(`/api/v1/citations/${id}`, { method: 'DELETE' });
    await onRefreshCitations();
    onNotify?.('Reference removed.', 'info');
  };

  const copyFormatted = async (c: CitationEntry) => {
    await navigator.clipboard.writeText(formatCitation(c, style));
    setCopiedId(c.id);
    onNotify?.(`${style} citation copied to clipboard.`, 'success');
    setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="space-y-6">
      {/* Academic Integrity Reporting */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Academic Integrity Reporting
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Evaluate AI assistance risk, paraphrase integrity, inline citation coverage, and uncited empirical claims across any analyzed paper.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {records.length > 0 && (
              <select
                aria-label="Select analyzed paper for academic integrity report"
                value={selectedRecord?.id || ''}
                onChange={(e) => setSelectedRecordId(e.target.value)}
                className="max-w-[240px] truncate text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
              >
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
            {selectedRecord && (
              <button
                type="button"
                onClick={() => exportRecordPdf(selectedRecord)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Integrity PDF
              </button>
            )}
          </div>
        </div>

        {selectedRecord && selectedRecord.academicIntegrity ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500">Integrity Index</div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedRecord.academicIntegrity.integrityScore}/100
                </div>
                <div
                  className={`text-xs font-medium ${
                    selectedRecord.academicIntegrity.riskLevel === 'Low Risk'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : selectedRecord.academicIntegrity.riskLevel === 'Moderate Risk'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {selectedRecord.academicIntegrity.riskLevel}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Citation Coverage</div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedRecord.academicIntegrity.citationCoverageScore}%
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  {selectedRecord.academicIntegrity.inlineCitationCount} inline citation(s)
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Paraphrase Integrity</div>
                <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedRecord.academicIntegrity.paraphraseIntegrityScore}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Uncited Claims</div>
                <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {selectedRecord.academicIntegrity.uncitedClaimCount}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 lg:border-l border-slate-200 dark:border-slate-800 lg:pl-6 space-y-3 text-xs">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Diagnostic Findings
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {selectedRecord.academicIntegrity.findings.map((f, i) => (
                    <li key={i}>· {f}</li>
                  ))}
                </ul>
              </div>
              {(selectedRecord.extractedCitations || []).length > 0 && (
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Extracted Inline References
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-2">
                    {selectedRecord.extractedCitations!.map((cit, i) => (
                      <span key={i}>{cit}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Analyze a document to inspect its academic integrity report.</p>
        )}
      </div>

      {/* Citation Management Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Citation &amp; Bibliography Manager ({citations.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <div
                role="tablist"
                aria-label="Citation formatting style"
                className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md overflow-x-auto no-scrollbar max-w-full"
              >
                {(['APA', 'MLA', 'Chicago', 'IEEE', 'BibTeX'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="tab"
                    aria-selected={style === st}
                    onClick={() => setStyle(st)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
                      style === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => exportCitationsBibtex(citations)}
                disabled={citations.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export .bib
              </button>
            </div>
          </div>

          <form onSubmit={handleResolveAndSave} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              aria-label="Paper title, DOI, or URL to resolve citation"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Verify & resolve by paper title, DOI (e.g. 10.18653/...), or URL..."
              className="flex-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={lookupBusy || !lookupQuery.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {lookupBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              {lookupBusy ? 'Verifying Source...' : 'Resolve & Verify Citation'}
            </button>
          </form>

          {lookupError && (
            <div role="alert" className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {lookupError}
            </div>
          )}

          {citations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded">
              No saved references yet. Resolve a DOI/URL above or add a reference manually.
            </div>
          ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
            {citations.map((c) => (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span
                        className={
                          c.verificationStatus === 'Verified Source'
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-amber-700 dark:text-amber-400 font-medium'
                        }
                      >
                        {c.verificationStatus}
                      </span>
                      <span>·</span>
                      <span>{c.sourceType}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{c.year}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {c.title}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyFormatted(c)}
                      className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded cursor-pointer"
                      aria-label={`Copy ${style} citation for ${c.title}`}
                      title={`Copy ${style}`}
                    >
                      {copiedId === c.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCitation(c.id)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Delete citation ${c.title}`}
                      title="Delete citation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <pre className="text-xs font-mono whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  {formatCitation(c, style)}
                </pre>

                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 hover:underline break-all"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {c.url}
                  </a>
                )}
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Manual Citation Form */}
        <form
          onSubmit={handleManualAdd}
          className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3 h-fit"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Add Reference Manually
          </h3>
          <input
            type="text"
            aria-label="Reference title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title of paper, article, or book"
            className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            aria-label="Reference authors"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Authors (comma-separated)"
            className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              aria-label="Publication year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Year"
              className="col-span-1 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              aria-label="Journal or publisher"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Journal / Publisher"
              className="col-span-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
            />
          </div>
          <input
            type="text"
            aria-label="DOI identifier"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="DOI (optional)"
            className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            aria-label="Source URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Source URL (optional)"
            className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Save to Bibliography Vault
          </button>
        </form>
      </div>
    </div>
  );
}
