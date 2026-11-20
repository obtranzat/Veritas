import { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Loader2, Mic, Upload } from 'lucide-react';
import type { DetectionRecord, TeamUser } from '../types/veritas.ts';
import { DetectionReportView } from './DetectionReportView.tsx';

interface MediaForensicsWorkspaceProps {
  users: TeamUser[];
  onRecordCreated: (record: DetectionRecord) => void;
  onRecordUpdated?: (updated: DetectionRecord) => void;
  onHumanizeText: (text: string, recordId: string) => void;
  onAddComment: (recordId: string, text: string, userId: string) => Promise<void>;
}

export function MediaForensicsWorkspace({
  users,
  onRecordCreated,
  onRecordUpdated,
  onHumanizeText,
  onAddComment,
}: MediaForensicsWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<'image' | 'audio' | 'video'>('image');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DetectionRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleChooseFile = (file: File) => {
    setSelectedFile(file);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
      setMediaKind('audio');
    } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name)) {
      setMediaKind('video');
    } else {
      setMediaKind('image');
    }
  };

  const runForensics = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const res = await fetch('/api/v1/analyze-media', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Media inspection failed.');
      }
      const record = data as DetectionRecord;
      setReport(record);
      onRecordCreated(record);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Media forensics failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Multimodal Image, Audio & Video Forensics
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect PNG/JPG/JPEG/WEBP/TIFF metadata & OCR, transcribe audio via speech-to-text, and audit video frames for deepfake artifacts and audio-sync drift.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" /> Image OCR + EXIF
            </span>
            <span className="inline-flex items-center gap-1">
              <Mic className="w-3.5 h-3.5" /> Audio Transcription
            </span>
            <span className="inline-flex items-center gap-1">
              <Film className="w-3.5 h-3.5" /> Video Deepfake
            </span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop an image, audio, or video file or press Enter to browse"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleChooseFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 rounded-lg p-8 text-center cursor-pointer transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Media file selector"
            accept="image/png,image/jpeg,image/webp,image/tiff,audio/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleChooseFile(f);
            }}
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-7 h-7 text-slate-500 dark:text-slate-400" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {selectedFile
                ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                : 'Drop an image, audio recording, or video clip here'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              PNG · JPG · JPEG · WEBP · TIFF · MP3 · WAV · OGG · MP4 · WEBM · MOV
            </div>
          </div>
        </div>

        {selectedFile && previewUrl && (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="max-w-md w-full">
              {mediaKind === 'image' && (
                <img
                  src={previewUrl}
                  alt={selectedFile.name}
                  className="max-h-52 rounded border border-slate-200 dark:border-slate-700 object-contain bg-slate-50 dark:bg-slate-950"
                />
              )}
              {mediaKind === 'audio' && (
                <audio controls src={previewUrl} className="w-full" />
              )}
              {mediaKind === 'video' && (
                <video
                  controls
                  src={previewUrl}
                  className="max-h-56 rounded border border-slate-200 dark:border-slate-700 bg-black"
                />
              )}
            </div>

            <button
              type="button"
              onClick={runForensics}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Inspecting Media...
                </>
              ) : (
                'Run Multimodal Forensics'
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {report && (
        <DetectionReportView
          key={report.id}
          record={report}
          users={users}
          onHumanizeText={onHumanizeText}
          onAddComment={onAddComment}
          onRecordUpdated={(updated) => {
            setReport(updated);
            onRecordUpdated?.(updated);
          }}
        />
      )}
    </div>
  );
}
