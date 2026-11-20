import { useEffect, useRef, useState } from 'react';
import { Archive, FileUp, Loader2, Play, Trash2 } from 'lucide-react';
import type { DetectionRecord, QueueJob } from '../types/veritas.ts';
import { exportBulkZip } from '../utils/exportClient.ts';

interface BatchQueueWorkspaceProps {
  jobs: QueueJob[];
  onJobUpdated: (job: QueueJob) => void;
  onInspectRecordId: (recordId: string) => void;
  records: DetectionRecord[];
}

export function BatchQueueWorkspace({
  jobs,
  onJobUpdated,
  onInspectRecordId,
  records,
}: BatchQueueWorkspaceProps) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [concurrency, setConcurrency] = useState<number>(4);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobs[0]?.id || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeJob = jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;

  // Subscribe to SSE stream for any processing or queued job
  useEffect(() => {
    const liveJobs = jobs.filter(
      (j) => j.status === 'queued' || j.status === 'processing'
    );
    if (liveJobs.length === 0) return;

    const sources = liveJobs.map((job) => {
      const es = new EventSource(`/api/v1/jobs/${job.id}/stream`);
      es.onmessage = (evt) => {
        try {
          const updated = JSON.parse(evt.data) as QueueJob;
          onJobUpdated(updated);
        } catch {
          // ignore parse noise
        }
      };
      return es;
    });

    return () => {
      sources.forEach((s) => s.close());
    };
  }, [jobs.map((j) => `${j.id}:${j.status}`).join(',')]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setStagedFiles((prev) => [...prev, ...arr]);
  };

  const launchBatch = async () => {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('concurrency', String(concurrency));
      for (const f of stagedFiles) {
        form.append('files', f);
      }
      const res = await fetch('/api/v1/detect/batch', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to enqueue batch.');
      }
      const createdJob = data as QueueJob;
      onJobUpdated(createdJob);
      setSelectedJobId(createdJob.id);
      setStagedFiles([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Batch upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Unlimited Drag & Drop Staging */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Unlimited Batch Upload & Concurrent Queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Drop any number of documents, images, audio, or video files simultaneously. No file count or tier caps.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="text-slate-600 dark:text-slate-400" htmlFor="concurrency-select">
              Worker Concurrency:
            </label>
            <select
              id="concurrency-select"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100"
            >
              {[1, 2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n} parallel workers
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Drag and drop unlimited files or press Enter to select multiple files"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`border border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Select multiple files for batch analysis"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="flex flex-col items-center gap-2">
            <FileUp className="w-7 h-7 text-slate-500 dark:text-slate-400" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Drag and drop unlimited files here, or click to select multiple
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Documents (PDF, DOCX, TXT, RTF, ODT) · Images (PNG, JPG, WEBP, TIFF) · Audio & Video
            </div>
          </div>
        </div>

        {stagedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                {stagedFiles.length} file(s) staged ·{' '}
                {(
                  stagedFiles.reduce((acc, f) => acc + f.size, 0) / 1024
                ).toFixed(1)}{' '}
                KB total
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStagedFiles([])}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                >
                  Clear Queue
                </button>
                <button
                  type="button"
                  onClick={launchBatch}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Start Parallel Analysis
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
              {stagedFiles.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-800 dark:text-slate-200 truncate">
                    {f.name}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono tabular-nums text-slate-500">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name} from queue`}
                      onClick={() =>
                        setStagedFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-500 hover:text-red-600 cursor-pointer p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Queue Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Processing Queue ({jobs.length})
            </h3>
          </div>
          {jobs.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              No batch jobs queued yet. Stage multiple files above to monitor parallel execution in real time.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left px-5 py-3.5 space-y-2 transition-colors cursor-pointer ${
                    activeJob?.id === job.id
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {job.label}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 capitalize">
                      {job.status} · {job.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        job.status === 'failed'
                          ? 'bg-red-600'
                          : job.status === 'completed'
                            ? 'bg-emerald-600'
                            : 'bg-blue-600'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {job.completedItems}/{job.totalItems} complete · {job.concurrency} workers ·{' '}
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeJob ? `Job Details: ${activeJob.label}` : 'Job Item Breakdown'}
            </h3>
            {activeJob && activeJob.resultRecordIds.length > 0 && (
              <button
                type="button"
                onClick={() => exportBulkZip(activeJob.resultRecordIds)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <Archive className="w-3.5 h-3.5" />
                Download Batch ZIP
              </button>
            )}
          </div>

          {!activeJob ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              Select a batch job from the left to inspect per-file status and scores.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">File</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">AI Score</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeJob.items.map((item) => {
                    const rec = item.recordId
                      ? records.find((r) => r.id === item.recordId)
                      : undefined;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-[220px] truncate">
                          {item.fileName}
                        </td>
                        <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300">
                          {item.error ? (
                            <span className="text-red-700 dark:text-red-400">
                              Failed: {item.error}
                            </span>
                          ) : (
                            item.status
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {rec ? `${rec.aiProbability}% (${rec.verdict})` : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {item.recordId && (
                            <button
                              type="button"
                              onClick={() => onInspectRecordId(item.recordId!)}
                              className="text-blue-700 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                            >
                              Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
