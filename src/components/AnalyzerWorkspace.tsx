import { useRef, useState } from 'react';
import { FileUp, Loader2, Search, Trash2 } from 'lucide-react';
import type { DetectionRecord, TeamUser } from '../types/veritas.ts';
import { DetectionReportView } from './DetectionReportView.tsx';

interface AnalyzerWorkspaceProps {
  users: TeamUser[];
  activeRecord: DetectionRecord | null;
  onRecordCreated: (record: DetectionRecord) => void;
  onRecordUpdated: (record: DetectionRecord) => void;
  onHumanizeText: (text: string, recordId: string) => void;
  onAddComment: (recordId: string, text: string, userId: string) => Promise<void>;
  onNavigateTab?: (tab: 'code' | 'provenance' | 'batch' | 'crawler') => void;
}

const SAMPLE_AI_PASSAGE =
  "In today's rapidly evolving technological landscape, organizations must delve into comprehensive automation strategies to streamline complex operational workflows. Furthermore, it is important to note that predictive analytics plays a crucial role in fostering innovation and driving sustainable growth across multifaceted enterprise ecosystems. Ultimately, leveraging data-driven governance frameworks underscores the importance of balancing efficiency with ethical accountability.";

const SAMPLE_HUMAN_PASSAGE =
  "When we finally hauled the weather buoy back onto the aft deck, half the anodized mounting bracket had sheared clean off in the storm swell. My co-skipper swore twice, grabbed a three-quarter wrench, and wedged a cedar shim under the battery housing just to stop it rattling while we motored back to Sitka. The telemetry logs survived, though—every single pressure spike from 2 a.m. onward was right there on the SD card.";

export function AnalyzerWorkspace({
  users,
  activeRecord,
  onRecordCreated,
  onRecordUpdated,
  onHumanizeText,
  onAddComment,
  onNavigateTab,
}: AnalyzerWorkspaceProps) {
  const [mode, setMode] = useState<'text' | 'document'>('text');
  const [title, setTitle] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [text, setText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const runTextScan = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          title: title.trim() || undefined,
          targetKeyword: targetKeyword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Detection request failed.');
      }
      onRecordCreated(data as DetectionRecord);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Detection failed.');
    } finally {
      setLoading(false);
    }
  };

  const runFileScan = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/analyze-media', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Document analysis failed.');
      }
      onRecordCreated(data as DetectionRecord);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Document scan failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Analysis input mode"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md max-w-full overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'text'}
              onClick={() => setMode('text')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'text'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Plain Text
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'document'}
              onClick={() => setMode('document')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'document'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Upload Document
            </button>
          </div>

          {mode === 'text' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Load sample:</span>
              <button
                type="button"
                onClick={() => {
                  setTitle('Synthetic Governance Memo Sample');
                  setTargetKeyword('automation');
                  setText(SAMPLE_AI_PASSAGE);
                }}
                className="px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded cursor-pointer whitespace-nowrap"
              >
                AI Sample
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle('Sitka Buoy Field Log Sample');
                  setTargetKeyword('');
                  setText(SAMPLE_HUMAN_PASSAGE);
                }}
                className="px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded cursor-pointer whitespace-nowrap"
              >
                Human Sample
              </button>
              {text && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle('');
                    setTargetKeyword('');
                    setText('');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {mode === 'text' ? (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                aria-label="Optional document title or identifier"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional document title or identifier..."
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
              <input
                type="text"
                aria-label="Optional target SEO keyword"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="Optional target SEO keyword..."
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <textarea
              aria-label="Text content to analyze"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Paste any length of text for unified AI detection, Content Authenticity scoring, Quality & Readability grading, SEO/GEO auditing, Academic Integrity, and Citation extraction..."
              className="w-full text-[15px] leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 resize-y"
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>{wordCount} words</span>
                <span aria-hidden="true">·</span>
                <span>{text.length} characters</span>
                <span aria-hidden="true">·</span>
                <span>Unlimited length</span>
              </div>

              <button
                type="button"
                onClick={runTextScan}
                disabled={loading || !text.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running Intelligence Suite...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Analyze Content
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop a document here or press Enter to browse files"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void runFileScan(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border border-dashed rounded-lg p-8 sm:p-10 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Document file selector"
                accept=".pdf,.docx,.txt,.rtf,.odt,.md,.csv,.html"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void runFileScan(chosen);
                }}
              />
              <div className="flex flex-col items-center gap-2.5">
                {loading ? (
                  <Loader2 className="w-8 h-8 text-blue-700 dark:text-blue-400 animate-spin" />
                ) : (
                  <FileUp className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                )}
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {loading
                    ? 'Extracting text and running full content intelligence pipeline...'
                    : 'Drop a document here or click to browse'}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Supports PDF, DOCX, TXT, RTF, ODT, MD, HTML · No artificial size caps
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-5 sm:mx-6 mb-6 p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}
      </div>

      {activeRecord ? (
        <DetectionReportView
          key={activeRecord.id}
          record={activeRecord}
          users={users}
          onHumanizeText={onHumanizeText}
          onAddComment={onAddComment}
          onRecordUpdated={onRecordUpdated}
        />
      ) : (
        <section
          aria-label="Open-Source AI Detection & Content Intelligence Overview"
          className="space-y-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Open-Source AI Detector, Humanizer &amp; Content Authenticity Workbench
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Veritas is a free, self-hosted alternative to Pangram, GPTZero, Originality.ai, and Turnitin—running deterministic stylometry and local LLMs with zero word caps, file limits, or subscriptions.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <button
                type="button"
                onClick={() => onNavigateTab?.('batch')}
                className="p-3.5 text-left rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer space-y-1"
              >
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  Parallel Batch Queue
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Analyze unlimited PDF, DOCX, image, audio, or video files concurrently.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.('code')}
                className="p-3.5 text-left rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer space-y-1"
              >
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  Code AI, AST &amp; Security
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Audit source code AST overlap, SPDX licenses, and adversarial smuggling.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.('provenance')}
                className="p-3.5 text-left rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer space-y-1"
              >
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  Veritas Proof &amp; Stylometry
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Mint Ed25519 drafting proofs or compare non-reversible author twins.
                </p>
              </button>
            </div>
          </div>

          <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-6 py-4 text-xs">
            <summary className="font-semibold text-slate-900 dark:text-slate-100 cursor-pointer select-none">
              Platform Architecture, Supported Formats &amp; Frequently Asked Questions
            </summary>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-600 dark:text-slate-400 leading-relaxed">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  How does Veritas detect AI content without cloud lock-in?
                </h3>
                <p>
                  Every scan evaluates sentence-level burstiness, perplexity variance, type-token ratio, and AI-spin heuristics locally first, with automatic 11-tier failover to Ollama, vLLM, LM Studio, or optional cloud APIs.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Can I connect external tools or automate CI checks?
                </h3>
                <p>
                  Yes—browse the self-hosted{' '}
                  <a href="/api/docs" className="text-blue-700 dark:text-blue-400 underline">
                    OpenAPI 3.1 API Explorer
                  </a>
                  , download{' '}
                  <a href="/api/openapi.json" className="text-blue-700 dark:text-blue-400 underline">
                    openapi.json
                  </a>
                  , or inspect machine-readable metadata at{' '}
                  <a href="/llms.txt" className="text-blue-700 dark:text-blue-400 underline">
                    llms.txt
                  </a>
                  .
                </p>
              </div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
