import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, TrendingUp, XCircle } from 'lucide-react';
import type {
  DetectionRecord,
  GeoAnalysisReport,
  SeoAnalysisReport,
} from '../types/veritas.ts';

interface SeoQualityWorkspaceProps {
  records: DetectionRecord[];
  onRecordCreatedOrUpdated: (record: DetectionRecord) => void;
}

export function SeoQualityWorkspace({
  records,
  onRecordCreatedOrUpdated,
}: SeoQualityWorkspaceProps) {
  const [title, setTitle] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [text, setText] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [seoReport, setSeoReport] = useState<SeoAnalysisReport | null>(
    records[0]?.seoAnalysis || null
  );
  const [geoReport, setGeoReport] = useState<GeoAnalysisReport | null>(
    records[0]?.geoAnalysis || null
  );
  const [activeRecord, setActiveRecord] = useState<DetectionRecord | null>(
    records[0] || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRecord && records[0]) {
      setActiveRecord(records[0]);
      setSeoReport(records[0].seoAnalysis || null);
      setGeoReport(records[0].geoAnalysis || null);
    }
  }, [records, activeRecord]);

  const handleLoadRecord = (id: string) => {
    setSelectedRecordId(id);
    const rec = records.find((r) => r.id === id);
    if (rec) {
      setTitle(rec.title ?? '');
      setText(rec.fullText ?? '');
      setTargetKeyword(rec.seoAnalysis?.targetKeyword ?? '');
      setSeoReport(rec.seoAnalysis || null);
      setGeoReport(rec.geoAnalysis || null);
      setActiveRecord(rec);
    }
  };

  const runSeoAndQuality = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (selectedRecordId) {
        const res = await fetch('/api/v1/seo-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            title,
            targetKeyword,
            recordId: selectedRecordId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'SEO audit failed.');
        setSeoReport(data.seoAnalysis as SeoAnalysisReport);
        if (data.geoAnalysis) setGeoReport(data.geoAnalysis as GeoAnalysisReport);
        if (data.updatedRecord) {
          setActiveRecord(data.updatedRecord as DetectionRecord);
          onRecordCreatedOrUpdated(data.updatedRecord as DetectionRecord);
        }
      } else {
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
        if (!res.ok) throw new Error(data.error || 'Analysis failed.');
        const rec = data as DetectionRecord;
        setActiveRecord(rec);
        setSeoReport(rec.seoAnalysis || null);
        setGeoReport(rec.geoAnalysis || null);
        onRecordCreatedOrUpdated(rec);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              SEO Optimization, Content Quality & Readability Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit target keyword density, heading structure, SERP meta previews, editorial depth, and multi-index readability scores.
            </p>
          </div>

          {records.length > 0 && (
            <select
              aria-label="Select existing detection record for SEO audit"
              value={selectedRecordId}
              onChange={(e) => handleLoadRecord(e.target.value)}
              className="max-w-[240px] truncate text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
            >
              <option value="">Analyze new draft or select record...</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            aria-label="Page or article title for SERP preview"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page or article title (for SERP preview)..."
            className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            aria-label="Target primary keyword"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            placeholder="Target primary keyword (e.g. open source ai detection)..."
            className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
          />
        </div>

        <textarea
          aria-label="Article or landing-page draft text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Paste article or landing-page draft (Markdown headings # / ## supported)..."
          className="w-full text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={runSeoAndQuality}
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5" />
            )}
            {loading ? 'Auditing Draft...' : 'Run SEO & Quality Audit'}
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {seoReport && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  SEO Optimization Audit
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Search Intent: {seoReport.searchIntent} · Transition Ratio:{' '}
                  <span className="font-mono tabular-nums">{seoReport.transitionWordRatio}%</span>
                </div>
              </div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {seoReport.overallScore}/100
              </div>
            </div>

            <div className="p-4 rounded border border-slate-200 dark:border-slate-800 space-y-1.5 bg-slate-50/40 dark:bg-slate-950/30">
              <div className="text-[11px] text-slate-500">
                Suggested SERP Title ({seoReport.suggestedTitle.length}/60 chars) &amp; Meta Description ({seoReport.suggestedMetaDescription.length}/160 chars)
              </div>
              <div className="text-base font-medium text-blue-700 dark:text-blue-400">
                {seoReport.suggestedTitle}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {seoReport.suggestedMetaDescription}
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
              {seoReport.checklist.map((item, idx) => (
                <div key={idx} className="p-3 flex items-start gap-2.5 text-xs">
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

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Extracted Keyphrases & Density
              </h3>
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 font-medium">Keyword</th>
                    <th className="py-2 font-medium text-right">Count</th>
                    <th className="py-2 font-medium text-right">Density</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {seoReport.topKeywords.map((kw) => (
                    <tr key={kw.keyword}>
                      <td className="py-2 font-medium text-slate-900 dark:text-slate-100">
                        {kw.keyword}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {kw.count}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {kw.densityPercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {geoReport && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Generative Engine Optimization (GEO)
                  </h3>
                  <span className="font-mono tabular-nums text-sm font-semibold text-blue-700 dark:text-blue-400">
                    {geoReport.geoScore}/100
                  </span>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {[
                    ['Entity Density', `${geoReport.entityDensityScore}/100`],
                    ['Direct-Answer Readiness', `${geoReport.directAnswerReadiness}/100`],
                    ['Schema / Fact Structure', `${geoReport.schemaReadiness}/100`],
                    ['AI Citation Worthiness', `${geoReport.citationWorthinessScore}/100`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2">
                      <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                      <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                {geoReport.recommendations.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 pt-1">
                    {geoReport.recommendations.map((rec, i) => (
                      <li key={i}>· {rec}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeRecord && activeRecord.contentQuality && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Content Quality & Readability
                  </h3>
                  <span className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeRecord.contentQuality.overallScore}/100
                  </span>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {[
                    ['Depth & Specificity', `${activeRecord.contentQuality.depthAndSpecificity}/100`],
                    ['Evidence Density', `${activeRecord.contentQuality.evidenceDensity}/100`],
                    ['Coherence & Flow', `${activeRecord.contentQuality.coherenceAndFlow}/100`],
                    ['Flesch-Kincaid Grade', `${activeRecord.readability.fleschKincaidGrade}`],
                    ['Coleman-Liau Index', `${activeRecord.readability.colemanLiauIndex}`],
                    ['Target Audience', activeRecord.readability.targetAudience],
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
