import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.VERITAS_BENCH_URL || 'http://127.0.0.1:3000';

async function runConcurrentStage({ name, url, method = 'GET', body, concurrency, totalRequests }) {
  const latencies = [];
  let succeeded = 0;
  let failed = 0;
  const startAll = performance.now();
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= totalRequests) break;
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE_URL}${url}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        await res.arrayBuffer();
        const dt = performance.now() - t0;
        latencies.push(dt);
        if (res.ok) succeeded++;
        else failed++;
      } catch {
        latencies.push(performance.now() - t0);
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSec = (performance.now() - startAll) / 1000;
  latencies.sort((a, b) => a - b);

  const percentile = (p) => {
    if (latencies.length === 0) return 0;
    const i = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
    return Math.round(latencies[i] * 100) / 100;
  };

  return {
    name,
    concurrency,
    totalRequests,
    succeeded,
    failed,
    elapsedSec: Math.round(elapsedSec * 1000) / 1000,
    rps: Math.round((totalRequests / Math.max(0.001, elapsedSec)) * 10) / 10,
    p50Ms: percentile(50),
    p95Ms: percentile(95),
    p99Ms: percentile(99),
    maxMs: latencies.length ? Math.round(latencies[latencies.length - 1] * 100) / 100 : 0,
  };
}

async function main() {
  // Force local-only mode during benchmark if server runs locally
  const startMem = process.memoryUsage();
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health || health.status !== 'ok') {
    console.error(`Server not reachable at ${BASE_URL}/api/health`);
    process.exit(1);
  }

  const sampleText =
    "In today's fast-paced digital landscape, organizations leverage robust solutions to streamline multifaceted workflows cleanly.";

  const stages = [
    await runConcurrentStage({
      name: 'GET /api/health (c=50)',
      url: '/api/health',
      concurrency: 50,
      totalRequests: 250,
    }),
    await runConcurrentStage({
      name: 'POST /api/v1/security/inspect (c=25)',
      url: '/api/v1/security/inspect',
      method: 'POST',
      body: { text: sampleText },
      concurrency: 25,
      totalRequests: 150,
    }),
    await runConcurrentStage({
      name: 'POST /api/v1/seo-analyze (c=25)',
      url: '/api/v1/seo-analyze',
      method: 'POST',
      body: { text: sampleText, title: 'Benchmark Doc', targetKeyword: 'solutions' },
      concurrency: 25,
      totalRequests: 150,
    }),
    await runConcurrentStage({
      name: 'POST /api/v1/security/inspect (burst c=50)',
      url: '/api/v1/security/inspect',
      method: 'POST',
      body: { text: 'function add(a, b) { return a + b; }' },
      concurrency: 50,
      totalRequests: 150,
    }),
  ];

  const endMem = process.memoryUsage();
  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        timestamp: new Date().toISOString(),
        driverHeapDeltaMb: Math.round(((endMem.heapUsed - startMem.heapUsed) / 1024 / 1024) * 100) / 100,
        stages,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
