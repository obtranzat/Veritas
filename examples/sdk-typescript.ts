/**
 * Minimal zero-dependency TypeScript SDK example for Veritas v3.0+
 * Run with: npx tsx examples/sdk-typescript.ts
 */

export class VeritasClient {
  constructor(
    private readonly baseUrl = process.env.VERITAS_URL || 'http://127.0.0.1:3000',
    private readonly apiKey = process.env.VERITAS_API_KEY
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      h['x-api-key'] = this.apiKey;
    }
    return h;
  }

  async detect(text: string, title?: string, targetKeyword?: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/detect`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ text, title, targetKeyword }),
    });
    if (!res.ok) throw new Error(`Detect failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async humanize(text: string, intensity: 'light' | 'moderate' | 'aggressive' = 'moderate') {
    const res = await fetch(`${this.baseUrl}/api/v1/humanize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ text, intensity }),
    });
    if (!res.ok) throw new Error(`Humanize failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async mintAndVerifyProof(content: string, documentTitle: string, authorLabel: string) {
    const mintRes = await fetch(`${this.baseUrl}/api/v1/proofs/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        content,
        documentTitle,
        authorLabel,
        keystrokeEvents: content.length,
        pasteEvents: 0,
        editBurstCount: 4,
        durationSeconds: 45,
      }),
    });
    if (!mintRes.ok) throw new Error(`Proof mint failed: ${await mintRes.text()}`);
    const proof = await mintRes.json();

    const verifyRes = await fetch(`${this.baseUrl}/api/v1/proofs/verify`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ bundle: proof, rawContent: content }),
    });
    return { proof, verification: await verifyRes.json() };
  }
}

async function main() {
  const client = new VeritasClient();
  const sample =
    'When we retrieved the telemetry buoy off Sitka Harbor, salt water had corroded the main housing bolt, so we fabricated a temporary brass shim on deck to capture the remaining storm readings cleanly.';

  const scan = await client.detect(sample, 'Field Log', 'telemetry');
  console.log('Scan Verdict:', {
    id: scan.id,
    verdict: scan.verdict,
    aiProbability: scan.aiProbability,
    authenticity: scan.authenticity?.overallScore,
  });

  const proofResult = await client.mintAndVerifyProof(
    sample,
    'Field Log Attestation',
    'Research Engineer'
  );
  console.log('Ed25519 Verification:', proofResult.verification);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
