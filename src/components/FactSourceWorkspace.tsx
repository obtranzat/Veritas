import { useState } from 'react';
import { ExternalLink, Globe, Languages, Link2, Loader2, ShieldCheck } from 'lucide-react';
import type {
  CitationEntailmentResult,
  CrossLingualMatch,
  DetectionRecord,
  FactCheckReport,
} from '../types/veritas.ts';

interface FactSourceWorkspaceProps {
  records: DetectionRecord[];
  onRecordUpdated: () => Promise<void>;
}

const SAMPLE_CLAIMS_TEXT =
  'The James Webb Space Telescope was launched in December 2021 aboard an Ariane 5 rocket from Kourou, French Guiana, and orbits around the Sun-Earth L2 Lagrange point roughly 1.5 million kilometers from Earth. Meanwhile, the first iPhone was released in 2012 with 5G connectivity.';

export function FactSourceWorkspace({
  records,
  onRecordUpdated,
}: FactSourceWorkspaceProps) {
  const [text, setText] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [loadingFact, setLoadingFact] = useState(false);
  const [loadingWebPlag, setLoadingWebPlag] = useState(false);
  const [loadingCrossLingual, setLoadingCrossLingual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factReport, setFactReport] = useState<FactCheckReport | null>(null);
  const [webMatches, setWebMatches] = useState<
    NonNullable<DetectionRecord['plagiarism']['webMatches']>
  >([]);
  const [crossLingualMatches, setCrossLingualMatches] = useState<
    CrossLingualMatch[]
  >([]);

  // Claim-to-Source Entailment State
  const [entailClaim, setEntailClaim] = useState('');
  const [entailUrl, setEntailUrl] = useState('');
  const [entailBusy, setEntailBusy] = useState(false);
  const [entailResult, setEntailResult] =
    useState<CitationEntailmentResult | null>(null);

  const handleLoadRecord = (id: string) => {
    setSelectedRecordId(id);
    const rec = records.find((r) => r.id === id);
    if (rec) {
      setText(rec.fullText ?? '');
      if (rec.factCheck) setFactReport(rec.factCheck);
      if (rec.plagiarism.webMatches) setWebMatches(rec.plagiarism.webMatches);
      if (rec.crossLingualMatches) setCrossLingualMatches(rec.crossLingualMatches);
    }
  };

  const runFactCheck = async () => {
    if (!text.trim()) return;
    setLoadingFact(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          recordId: selectedRecordId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fact-check failed.');
      setFactReport(data.factCheck as FactCheckReport);
      await onRecordUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fact-check failed.');
    } finally {
      setLoadingFact(false);
    }
  };

  const runWebPlagiarism = async () => {
    if (!text.trim()) return;
    setLoadingWebPlag(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/plagiarism-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          recordId: selectedRecordId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Web plagiarism check failed.');
      setWebMatches(data.webMatches || []);
      await onRecordUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Web plagiarism check failed.');
    } finally {
      setLoadingWebPlag(false);
    }
  };

  const runCrossLingualPlagiarism = async () => {
    if (!text.trim()) return;
    setLoadingCrossLingual(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/plagiarism-crosslingual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          recordId: selectedRecordId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cross-lingual scan failed.');
      setCrossLingualMatches(data.crossLingualMatches || []);
      await onRecordUpdated();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Cross-lingual scan failed.'
      );
    } finally {
      setLoadingCrossLingual(false);
    }
  };

  const runEntailmentCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entailClaim.trim() || !entailUrl.trim()) return;
    setEntailBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/citations/entailment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim: entailClaim.trim(),
          citationUrl: entailUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Entailment audit failed.');
      setEntailResult(data as CitationEntailmentResult);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Entailment audit failed.'
      );
    } finally {
      setEntailBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Fact Checking, Source Verification & Live Web Plagiarism
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Extract factual claims, verify them against live web search grounding, inspect source credibility tiers, and cross-check originality online.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedRecordId('');
                setText(SAMPLE_CLAIMS_TEXT);
              }}
              className="px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Load Mixed-Fact Sample
            </button>
            {records.length > 0 && (
              <select
                aria-label="Load text from scan history"
                value={selectedRecordId}
                onChange={(e) => handleLoadRecord(e.target.value)}
                className="max-w-[230px] truncate text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
              >
                <option value="">Load from scan history...</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <textarea
          aria-label="Content to verify facts and originality"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste claims, articles, research summaries, or press releases to verify facts and web originality..."
          className="w-full text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={runCrossLingualPlagiarism}
            disabled={loadingCrossLingual || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {loadingCrossLingual ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Languages className="w-3.5 h-3.5" />
            )}
            {loadingCrossLingual ? 'Scanning Cross-Lingual...' : 'Cross-Language Plagiarism'}
          </button>

          <button
            type="button"
            onClick={runWebPlagiarism}
            disabled={loadingWebPlag || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {loadingWebPlag ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            {loadingWebPlag ? 'Checking Web Overlap...' : 'Check Live Web Plagiarism'}
          </button>

          <button
            type="button"
            onClick={runFactCheck}
            disabled={loadingFact || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {loadingFact ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {loadingFact ? 'Verifying Claims & Sources...' : 'Verify Facts & Sources'}
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {factReport && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Fact-Check & Source Provenance Verdict
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {factReport.summary}
              </p>
            </div>
            <div className="flex items-center gap-6 font-mono tabular-nums text-xs">
              <div>
                <div className="text-slate-500">Veracity</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {factReport.overallVeracityScore}/100
                </div>
              </div>
              <div>
                <div className="text-slate-500">Verified</div>
                <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {factReport.verifiedCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Disputed</div>
                <div className="text-lg font-semibold text-red-700 dark:text-red-400">
                  {factReport.disputedCount}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
            {factReport.claims.map((c) => (
              <div key={c.id} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
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
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {c.explanation}
                </p>
                {c.sources.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {c.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{s.domain}</span>
                        <span className="text-slate-500 dark:text-slate-400">· {s.credibilityTier}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {factReport.groundingSources.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                All Verified Grounding Sources ({factReport.groundingSources.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {factReport.groundingSources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {src.title}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      {src.credibilityTier}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {webMatches.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Web Plagiarism & External Overlap Matches ({webMatches.length})
          </h3>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
            {webMatches.map((m, idx) => (
              <div key={idx} className="p-3.5 space-y-1 text-xs">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  {m.title}
                </a>
                <div className="text-slate-600 dark:text-slate-300 italic">
                  “{m.matchedExcerpt}”
                </div>
                <div className="text-slate-500 dark:text-slate-400">{m.similarityNote}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {crossLingualMatches.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cross-Language Semantic Plagiarism Matches ({crossLingualMatches.length})
          </h3>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
            {crossLingualMatches.map((cm, idx) => (
              <div key={idx} className="p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={cm.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {cm.sourceTitle}
                  </a>
                  <span className="font-mono text-slate-500">
                    Source Language: {cm.sourceLanguage}
                  </span>
                </div>
                <div className="text-slate-700 dark:text-slate-200">
                  <strong>Original:</strong> “{cm.matchedOriginalExcerpt}”
                </div>
                <div className="text-slate-600 dark:text-slate-300 italic">
                  <strong>Translated Comparison:</strong> “{cm.translatedMatchExcerpt}”
                </div>
                <div className="text-slate-500 dark:text-slate-400">{cm.similarityNote}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Claim-to-Source Semantic Entailment Audit */}
      <form
        onSubmit={runEntailmentCheck}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4"
      >
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Claim-to-Source Semantic Entailment Auditor
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Detect hallucinated or misrepresented citations by checking whether a referenced URL actually entails or contradicts the specific claim made in prose.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            aria-label="Claim to verify against cited source"
            value={entailClaim}
            onChange={(e) => setEntailClaim(e.target.value)}
            placeholder="Claim to verify against cited source..."
            className="md:col-span-6 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <input
            type="url"
            aria-label="Cited source URL"
            value={entailUrl}
            onChange={(e) => setEntailUrl(e.target.value)}
            placeholder="https://cited-source.org/paper"
            className="md:col-span-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={entailBusy || !entailClaim.trim() || !entailUrl.trim()}
            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {entailBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
            Audit Citation
          </button>
        </div>

        {entailResult && (
          <div className="p-4 rounded border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`font-semibold text-sm ${
                  entailResult.status === 'Supported'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : entailResult.status === 'Contradicted'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {entailResult.status}
              </span>
              <span className="font-mono tabular-nums text-slate-500">
                Confidence {entailResult.confidence}% · {entailResult.sourceTitle}
              </span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">{entailResult.rationale}</p>
            {entailResult.matchedEvidenceQuote && (
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 italic text-slate-600 dark:text-slate-300">
                “{entailResult.matchedEvidenceQuote}”
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
