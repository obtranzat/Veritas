import { useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import type {
  DetectionRecord,
  HumanizationIntensity,
  HumanizedRevision,
} from '../types/veritas.ts';
import {
  exportHumanizedPdf,
  exportHumanizedTxt,
  exportRecordDocx,
} from '../utils/exportClient.ts';

interface HumanizerWorkspaceProps {
  initialText: string;
  initialRecordId?: string;
  records: DetectionRecord[];
  onRevisionSaved: () => void;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

export function HumanizerWorkspace({
  initialText = '',
  initialRecordId,
  records,
  onRevisionSaved,
  onNotify,
}: HumanizerWorkspaceProps) {
  const [sourceText, setSourceText] = useState(initialText ?? '');
  const [linkedRecordId, setLinkedRecordId] = useState<string>(
    initialRecordId ?? ''
  );
  const [intensity, setIntensity] = useState<HumanizationIntensity>('moderate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<HumanizedRevision | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof initialText === 'string' && initialText.length > 0) {
      setSourceText(initialText);
    }
    setLinkedRecordId(initialRecordId ?? '');
  }, [initialText, initialRecordId]);

  const runHumanize = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          intensity,
          recordId: linkedRecordId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Humanization failed.');
      }
      setRevision(data as HumanizedRevision);
      onRevisionSaved();
      onNotify?.('Humanization pass complete and re-verified.', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Humanization failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!revision) return;
    await navigator.clipboard.writeText(revision.humanizedText);
    setCopied(true);
    onNotify?.('Humanized output copied to clipboard.', 'success');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadDocx = async () => {
    if (!revision) return;
    const baseRecord: DetectionRecord =
      records.find((r) => r.id === linkedRecordId) || {
        id: revision.id,
        createdAt: revision.createdAt,
        sourceType: 'text',
        title: `Humanized_${revision.intensity}`,
        wordCount: revision.humanizedText.split(/\s+/).length,
        characterCount: revision.humanizedText.length,
        contentPreview: revision.humanizedText.slice(0, 120),
        fullText: revision.originalText,
        aiProbability: revision.recheckAiScore,
        humanProbability: 100 - revision.recheckAiScore,
        confidence: 90,
        verdict: revision.recheckVerdict,
        suspectedModelFamily: 'Human Authored',
        detectedLanguage: 'English',
        languageConfidence: 95,
        summary: revision.changesSummary,
        sentences: [],
        readability: {
          fleschReadingEase: 65,
          fleschKincaidGrade: 8,
          gunningFog: 9,
          smogIndex: 9,
          colemanLiauIndex: 8.5,
          automatedReadabilityIndex: 8.2,
          targetAudience: 'General / High School',
          avgSentenceLength: 16,
          avgSyllablesPerWord: 1.5,
          passiveVoicePercent: 5,
          readingTimeMinutes: 1,
          sentenceDistribution: {
            short: 2,
            medium: 4,
            long: 1,
            veryLong: 0,
          },
        },
        writingQuality: {
          overall: 84,
          clarity: 85,
          conciseness: 84,
          lexicalRichness: 82,
          structuralVariety: 85,
          burstiness: 52,
          typeTokenRatio: 0.72,
          hapaxRatio: 0.58,
        },
        plagiarism: { overallSimilarityPercent: 0, matches: [] },
        pluginFindings: [],
        humanizedVersions: [revision],
        comments: [],
        createdByUserId: 'usr-elena',
      };
    await exportRecordDocx(
      { ...baseRecord, humanizedVersions: [revision] },
      true
    );
  };

  const scoreDelta = revision
    ? Math.round((revision.originalAiScore - revision.recheckAiScore) * 10) / 10
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Humanization Engine & Automated Re-Verification
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rewrite AI-flagged passages while preserving facts, entities, and formatting, then automatically re-run against the detection engine.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Humanization intensity level"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md"
          >
            {(
              [
                { id: 'light', label: 'Light' },
                { id: 'moderate', label: 'Moderate' },
                { id: 'aggressive', label: 'Aggressive' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={intensity === opt.id}
                onClick={() => setIntensity(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  intensity === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Source Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="humanizer-source" className="font-medium text-slate-700 dark:text-slate-300">
                Original Content
              </label>
              {records.length > 0 && (
                <select
                  aria-label="Load source text from detection history"
                  value={linkedRecordId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setLinkedRecordId(id);
                    const rec = records.find((r) => r.id === id);
                    if (rec) setSourceText(rec.fullText ?? '');
                  }}
                  className="max-w-[230px] truncate text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-slate-700 dark:text-slate-200"
                >
                  <option value="">Load from detection history...</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.aiProbability}% AI)
                    </option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              id="humanizer-source"
              value={sourceText ?? ''}
              onChange={(e) => setSourceText(e.target.value)}
              rows={12}
              placeholder="Paste AI-flagged text here or load a previous detection record..."
              className="w-full text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 resize-y"
            />
          </div>

          {/* Humanized Output Column */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Humanized &amp; Re-Checked Output
              </span>
              {revision && (
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                  {revision.originalAiScore}% → {revision.recheckAiScore}% AI (
                  {scoreDelta >= 0 ? `-${scoreDelta}%` : `+${Math.abs(scoreDelta)}%`})
                </span>
              )}
            </div>

            <div className="min-h-[282px] text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
              {loading ? (
                <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400 py-20">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                  Rewriting at {intensity} intensity and re-verifying against detector...
                </div>
              ) : revision ? (
                revision.humanizedText
              ) : (
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Humanized prose and post-rewrite detection scores will appear here.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {revision && (
              <>
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Output'}
                </button>
                <button
                  type="button"
                  onClick={() => exportHumanizedTxt(revision)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> TXT
                </button>
                <button
                  type="button"
                  onClick={() => exportHumanizedPdf(revision)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDocx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> DOCX
                </button>
                <button
                  type="button"
                  onClick={() => setSourceText(revision.humanizedText)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Feed Output Back for Another Pass
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={runHumanize}
            disabled={loading || !sourceText.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Humanize & Re-Check
              </>
            )}
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {revision && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Re-Verification Verdict</div>
            <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              {revision.recheckVerdict} ({revision.recheckAiScore}% AI)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Baseline was {revision.originalAiScore}% AI
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Editorial Changes Applied</div>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {revision.changesSummary}
            </p>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Fact & Structure Preservation</div>
            <ul className="mt-1 space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {revision.preservedFactsNotes.map((note, idx) => (
                <li key={idx}>· {note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
