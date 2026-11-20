import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import type { DetectionRecord, TeamUser } from '../types/veritas.ts';
import { DetectionReportView } from './DetectionReportView.tsx';

interface LinkCrawlerWorkspaceProps {
  users: TeamUser[];
  onPagesAnalyzed: (records: DetectionRecord[]) => void;
  onRecordUpdated?: (updated: DetectionRecord) => void;
  onHumanizeText: (text: string, recordId: string) => void;
  onAddComment: (recordId: string, text: string, userId: string) => Promise<void>;
}

export function LinkCrawlerWorkspace({
  users,
  onPagesAnalyzed,
  onRecordUpdated,
  onHumanizeText,
  onAddComment,
}: LinkCrawlerWorkspaceProps) {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crawledRecords, setCrawledRecords] = useState<DetectionRecord[]>([]);
  const [discoveredLinks, setDiscoveredLinks] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const runCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const normalizedUrl = /^https?:\/\//i.test(url.trim())
        ? url.trim()
        : `https://${url.trim()}`;
      const res = await fetch('/api/v1/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, maxPages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'URL crawl failed.');
      }
      const pages = (data.pages || []) as DetectionRecord[];
      setCrawledRecords(pages);
      setDiscoveredLinks((data.discoveredLinks || []) as string[]);
      setSelectedIdx(0);
      if (pages.length > 0) {
        onPagesAnalyzed(pages);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to crawl URL.');
    } finally {
      setLoading(false);
    }
  };

  const selectedRecord = crawledRecords[selectedIdx] || null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={runCrawl}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Web Page & Domain Link Detection
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fetch live article prose, strip navigation boilerplate, optionally crawl linked same-origin pages, and score each page for AI generation.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            aria-label="Target web page URL to crawl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/blog/article"
            className="flex-1 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3.5 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          />

          <select
            aria-label="Crawl depth"
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2.5 text-slate-900 dark:text-slate-100"
          >
            <option value={1}>Single Page (1 URL)</option>
            <option value={3}>Shallow Crawl (up to 3 pages)</option>
            <option value={5}>Domain Crawl (up to 5 pages)</option>
            <option value={10}>Deep Crawl (up to 10 pages)</option>
          </select>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Crawling & Scanning...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                Crawl & Detect
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </form>

      {crawledRecords.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Crawled Pages ({crawledRecords.length})
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {discoveredLinks.length} internal links discovered
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Page Title & URL</th>
                  <th className="py-2.5 px-4 font-medium text-right">Words</th>
                  <th className="py-2.5 px-4 font-medium text-right">AI Score</th>
                  <th className="py-2.5 px-4 font-medium text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {crawledRecords.map((rec, idx) => (
                  <tr
                    key={rec.id}
                    tabIndex={0}
                    aria-selected={selectedIdx === idx}
                    onClick={() => setSelectedIdx(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedIdx(idx);
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      selectedIdx === idx
                        ? 'bg-blue-50/60 dark:bg-blue-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 max-w-md">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {rec.title}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {rec.sourceUrl}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {rec.wordCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {rec.aiProbability}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium">
                      <span
                        className={
                          rec.verdict === 'AI-Generated'
                            ? 'text-red-700 dark:text-red-400'
                            : rec.verdict === 'Mixed'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {rec.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRecord && (
        <DetectionReportView
          key={selectedRecord.id}
          record={selectedRecord}
          users={users}
          onHumanizeText={onHumanizeText}
          onAddComment={onAddComment}
          onRecordUpdated={(updated) => {
            setCrawledRecords((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
            onRecordUpdated?.(updated);
          }}
        />
      )}
    </div>
  );
}
