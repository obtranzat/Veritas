import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  Fingerprint,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type {
  AuthorDriftVerification,
  AuthorStylometricProfile,
  VeritasProofBundle,
} from '../types/veritas.ts';

interface ProvenanceAuthWorkspaceProps {
  authorProfiles: AuthorStylometricProfile[];
  proofs: VeritasProofBundle[];
  onRefresh: () => Promise<void>;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

const SAMPLE_PROSE_COMPARE =
  'In practical systems engineering, fault tolerance emerges not from assuming components will succeed indefinitely, but from bounding how failures propagate across state boundaries. When retries accumulate silently without explicit backoff budgets, small latency spikes compound into cascading outages across downstream services.';

export function ProvenanceAuthWorkspace({
  authorProfiles,
  proofs,
  onRefresh,
  onNotify,
}: ProvenanceAuthWorkspaceProps) {
  const [subTab, setSubTab] = useState<'proof' | 'stylometry'>('proof');

  // Monitored Drafting Editor & Veritas Proof state
  const [docTitle, setDocTitle] = useState('Research Draft Attestation');
  const [authorLabel, setAuthorLabel] = useState('Dr. Elena Rostova');
  const [draftText, setDraftText] = useState('');
  const [keystrokeEvents, setKeystrokeEvents] = useState(0);
  const [pasteEvents, setPasteEvents] = useState(0);
  const [editBurstCount, setEditBurstCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const lastInputTimeRef = useRef<number>(0);

  const [activeProof, setActiveProof] = useState<VeritasProofBundle | null>(
    proofs[0] || null
  );
  const [proofBusy, setProofBusy] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  // Proof Verifier state
  const [verifyJson, setVerifyJson] = useState('');
  const [verifyRawContent, setVerifyRawContent] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    validSignature: boolean;
    contentMatchesHash: boolean | null;
    merkleRootValid: boolean;
    reason: string;
  } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  // Stylometric Twin state
  const [newAuthorName, setNewAuthorName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [baselineSample, setBaselineSample] = useState('');
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(
    authorProfiles[0]?.id || ''
  );
  const [compareText, setCompareText] = useState('');
  const [driftResult, setDriftResult] = useState<AuthorDriftVerification | null>(
    null
  );
  const [compareBusy, setCompareBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProfileId && authorProfiles[0]?.id) {
      setSelectedProfileId(authorProfiles[0].id);
    }
  }, [authorProfiles, selectedProfileId]);

  useEffect(() => {
    if (!activeProof && proofs[0]) {
      setActiveProof(proofs[0]);
    }
  }, [proofs, activeProof]);

  useEffect(() => {
    const id = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleDraftChange = (nextVal: string) => {
    const now = Date.now();
    if (!startTimeRef.current && nextVal.length > 0) {
      startTimeRef.current = now;
    }
    if (now - lastInputTimeRef.current > 1800) {
      setEditBurstCount((b) => b + 1);
    }
    lastInputTimeRef.current = now;
    setKeystrokeEvents((k) => k + Math.max(1, Math.abs(nextVal.length - draftText.length)));
    setDraftText(nextVal);
  };

  const handleDraftPaste = () => {
    setPasteEvents((p) => p + 1);
  };

  const resetDraftTelemetry = () => {
    setDraftText('');
    setKeystrokeEvents(0);
    setPasteEvents(0);
    setEditBurstCount(0);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    lastInputTimeRef.current = 0;
  };

  const downloadProofBundle = (bundle: VeritasProofBundle) => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bundle.proofId}.veritas-proof.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onNotify?.(`Downloaded ${bundle.proofId}.veritas-proof.json`, 'success');
  };

  const mintProofBundle = async () => {
    if (!draftText.trim()) return;
    setProofBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/proofs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentTitle: docTitle.trim() || 'Untitled Draft',
          authorLabel: authorLabel.trim() || 'Anonymous Author',
          content: draftText,
          durationSeconds: Math.max(5, elapsedSeconds || 12),
          keystrokeEvents: Math.max(1, keystrokeEvents || draftText.length),
          pasteEvents,
          editBurstCount: Math.max(1, editBurstCount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mint proof bundle.');
      const minted = data as VeritasProofBundle;
      setActiveProof(minted);
      setVerifyJson(JSON.stringify(minted, null, 2));
      setVerifyRawContent(draftText);
      await onRefresh();
      onNotify?.(`Signed Ed25519 proof ${minted.proofId}.`, 'success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Proof creation failed.');
    } finally {
      setProofBusy(false);
    }
  };

  const verifyProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyJson.trim()) return;
    setVerifyBusy(true);
    setErrorMsg(null);
    try {
      const parsed = JSON.parse(verifyJson) as VeritasProofBundle;
      const res = await fetch('/api/v1/proofs/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: parsed,
          rawContent: verifyRawContent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Proof verification failed.');
      setVerifyResult(data);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Invalid proof JSON payload.'
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const enrollProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthorName.trim() || !baselineSample.trim()) return;
    setEnrollBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/authorship/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: newAuthorName.trim(),
          departmentOrRole: newDept.trim() || 'Independent Author',
          sampleText: baselineSample.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile enrollment failed.');
      setNewAuthorName('');
      setNewDept('');
      setBaselineSample('');
      setSelectedProfileId((data as AuthorStylometricProfile).id);
      await onRefresh();
      onNotify?.('Stylometric baseline vector enrolled.', 'success');
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Profile enrollment failed.'
      );
    } finally {
      setEnrollBusy(false);
    }
  };

  const deleteProfile = async (id: string) => {
    await fetch(`/api/v1/authorship/profiles/${id}`, { method: 'DELETE' });
    await onRefresh();
    onNotify?.('Author stylometric profile deleted.', 'info');
  };

  const checkDrift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfileId || !compareText.trim()) return;
    setCompareBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/authorship/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfileId,
          text: compareText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Drift verification failed.');
      setDriftResult(data as AuthorDriftVerification);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Drift verification failed.'
      );
    } finally {
      setCompareBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Provenance and authorship modes"
        className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit max-w-full overflow-x-auto no-scrollbar"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'proof'}
          onClick={() => setSubTab('proof')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
            subTab === 'proof'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5" />
          Veritas Proof (Ed25519 + SVG Seal)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'stylometry'}
          onClick={() => setSubTab('stylometry')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap shrink-0 ${
            subTab === 'stylometry'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Sovereign Author Stylometric Twin ({authorProfiles.length})
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 rounded border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {subTab === 'proof' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Monitored Drafting Studio */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Cryptographic Writing Attestation Editor
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Captures local keystroke cadence, paste ratio, edit bursts, and SHA-256 chunk Merkle tree to sign an offline-verifiable Ed25519 Veritas Proof bundle.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleDraftChange(SAMPLE_PROSE_COMPARE);
                    setEditBurstCount((b) => b + 6);
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Seed Draft Sample
                </button>
                {(draftText || keystrokeEvents > 0) && (
                  <button
                    type="button"
                    onClick={resetDraftTelemetry}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded cursor-pointer whitespace-nowrap"
                    aria-label="Reset draft and keystroke telemetry"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                aria-label="Attested document title"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Document title..."
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                aria-label="Attested author name"
                value={authorLabel}
                onChange={(e) => setAuthorLabel(e.target.value)}
                placeholder="Attested author name..."
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>

            <textarea
              aria-label="Monitored draft text for Ed25519 attestation"
              value={draftText}
              onChange={(e) => handleDraftChange(e.target.value)}
              onPaste={handleDraftPaste}
              rows={8}
              placeholder="Write or compose your draft here. Local process telemetry stays strictly inside your browser session until you mint a proof..."
              className="w-full text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>Keys: {keystrokeEvents}</span>
                <span>Pastes: {pasteEvents}</span>
                <span>Bursts: {editBurstCount}</span>
                <span>Elapsed: {elapsedSeconds}s</span>
              </div>
              <button
                type="button"
                onClick={mintProofBundle}
                disabled={proofBusy || !draftText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {proofBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Signing Ed25519 Proof...
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-3.5 h-3.5" />
                    Mint Ed25519 Veritas Proof
                  </>
                )}
              </button>
            </div>

            {activeProof && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Signed Proof Seal: {activeProof.proofId}
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Merkle Root: {activeProof.processMetrics.merkleRoot.slice(0, 24)}...
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadProofBundle(activeProof)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3 h-3" />
                      Download .veritas-proof.json
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `<img src="/api/v1/proofs/${activeProof.proofId}/badge.svg" alt="Veritas Proof ${activeProof.proofId}" />`
                        );
                        setCopiedEmbed(true);
                        onNotify?.('SVG badge embed snippet copied.', 'success');
                        setTimeout(() => setCopiedEmbed(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      {copiedEmbed ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedEmbed ? 'Embed Copied' : 'Copy SVG Embed'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          JSON.stringify(activeProof, null, 2)
                        );
                        setCopiedBundle(true);
                        onNotify?.('Proof bundle JSON copied.', 'success');
                        setTimeout(() => setCopiedBundle(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      {copiedBundle ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedBundle ? 'Bundle Copied' : 'Copy Proof JSON'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-4">
                  <img
                    src={`/api/v1/proofs/${activeProof.proofId}/badge.svg`}
                    alt={`Veritas Proof Seal ${activeProof.proofId}`}
                    className="h-11"
                  />
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    Keystrokes: {activeProof.processMetrics.keystrokeEvents} · Paste Ratio:{' '}
                    {activeProof.processMetrics.pasteRatioPercent}% · Bursts:{' '}
                    {activeProof.processMetrics.editBurstCount}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column: Proof Verifier + Saved Proof Archive */}
          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={verifyProof}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cryptographic Signature &amp; Hash Verifier
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Validate any `.veritas-proof.json` Ed25519 signature and Merkle root, optionally checking against raw published text.
              </p>
              <textarea
                aria-label="Veritas proof bundle JSON"
                value={verifyJson}
                onChange={(e) => setVerifyJson(e.target.value)}
                rows={5}
                placeholder="Paste VeritasProofBundle JSON..."
                className="w-full text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 text-slate-900 dark:text-slate-100"
              />
              <textarea
                aria-label="Optional raw text to verify SHA-256 content match"
                value={verifyRawContent}
                onChange={(e) => setVerifyRawContent(e.target.value)}
                rows={2}
                placeholder="Optional: Paste exact raw text to verify SHA-256 content match..."
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={verifyBusy || !verifyJson.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer"
              >
                {verifyBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileCheck2 className="w-3.5 h-3.5" />
                )}
                Verify Ed25519 Signature
              </button>

              {verifyResult && (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center gap-2 font-semibold">
                    {verifyResult.validSignature && verifyResult.merkleRootValid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Signature & Merkle Root Verified
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-700 dark:text-red-400" />
                        <span className="text-red-700 dark:text-red-400">
                          Verification Failed
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {verifyResult.reason}
                  </div>
                </div>
              )}
            </form>

            {proofs.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Minted Proof Seals ({proofs.length})
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                  {proofs.map((p) => (
                    <button
                      key={p.proofId}
                      type="button"
                      onClick={() => {
                        setActiveProof(p);
                        setVerifyJson(JSON.stringify(p, null, 2));
                      }}
                      className="w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {p.documentTitle}
                        </div>
                        <div className="text-slate-500 font-mono">
                          {p.proofId} · {p.authorLabel}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                        Ed25519
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Enrolled Author Vectors + New Profile Form */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Sovereign Author Stylometric Twins
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Non-reversible mathematical cadence vectors (function-word frequencies, burstiness, TTR, hapax ratio). Raw baseline prose is immediately discarded after vector extraction.
                </p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
                {authorProfiles.map((prof) => (
                  <div
                    key={prof.id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {prof.authorName}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {prof.departmentOrRole} ·{' '}
                        <span className="font-mono tabular-nums">
                          {prof.sampleCount} samples · {prof.totalWordsProfiled} words profiled
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 mt-1 tabular-nums">
                        AvgSent {prof.vector.avgSentenceLength} · Burst{' '}
                        {prof.vector.burstiness}% · TTR {prof.vector.typeTokenRatio}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedProfileId(prof.id)}
                        className={`px-2.5 py-1 rounded border cursor-pointer ${
                          selectedProfileId === prof.id
                            ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteProfile(prof.id)}
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label={`Delete ${prof.authorName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={enrollProfile}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Enroll New Author Stylometric Vector (Raw Text Never Stored)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  aria-label="New author name"
                  value={newAuthorName}
                  onChange={(e) => setNewAuthorName(e.target.value)}
                  placeholder="Author name (e.g. Maya Patel)"
                  className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  aria-label="Author department or role"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  placeholder="Department or role..."
                  className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
                />
              </div>
              <textarea
                aria-label="Baseline sample writing for stylometric vector"
                value={baselineSample}
                onChange={(e) => setBaselineSample(e.target.value)}
                rows={4}
                placeholder="Paste >=25 words written by this author to extract their mathematical cadence vector..."
                className="w-full text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={enrollBusy || !newAuthorName.trim() || !baselineSample.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {enrollBusy ? 'Extracting Vector...' : 'Enroll Non-Reversible Vector'}
              </button>
            </form>
          </div>

          {/* Authorship Drift Verification */}
          <div className="lg:col-span-6 space-y-6">
            <form
              onSubmit={checkDrift}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Compare Submission Against Baseline Twin
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Measures cosine similarity and dimensional cadence drift against the selected author vector.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCompareText(SAMPLE_PROSE_COMPARE)}
                  className="px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Load Comparison Sample
                </button>
              </div>

              <select
                aria-label="Baseline author stylometric profile"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-slate-100"
              >
                {authorProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.authorName} ({p.departmentOrRole})
                  </option>
                ))}
              </select>

              <textarea
                aria-label="Submission text to compare against baseline twin"
                value={compareText}
                onChange={(e) => setCompareText(e.target.value)}
                rows={7}
                placeholder="Paste at least 20 words of the new submission to measure stylistic drift..."
                className="w-full text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 text-slate-900 dark:text-slate-100"
              />

              <button
                type="submit"
                disabled={compareBusy || !selectedProfileId || !compareText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded disabled:opacity-50 cursor-pointer"
              >
                {compareBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5" />
                )}
                Measure Authorship Drift
              </button>

              {driftResult && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-semibold ${
                        driftResult.matchVerdict === 'Consistent Authorship'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : driftResult.matchVerdict === 'Moderate Stylistic Shift'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {driftResult.matchVerdict}
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      Drift {driftResult.driftScore}/100 · Cosine{' '}
                      {driftResult.cosineSimilarity}
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      Diverging Stylometric Signals
                    </div>
                    {driftResult.divergingDimensions.map((dim, i) => (
                      <div key={i}>· {dim}</div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
