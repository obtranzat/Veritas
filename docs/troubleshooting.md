# Veritas Troubleshooting & FAQ

Solutions for common installation, runtime, local inference, container, and reverse-proxy issues.

---

## 1. Startup & Runtime Issues

### Port `3000` is already in use (`EADDRINUSE`)

Find and stop the conflicting process, or assign another port for local testing:

```bash
lsof -i :3000
PORT=3001 npm run dev
```

*(Note: AI Studio preview and container health checks expect port `3000` inside the container.)*

### Node.js version mismatch / Syntax errors on `node server.ts`

Veritas uses native TypeScript type stripping in Node.js `>=22.0.0`. Verify your runtime:

```bash
node -v
# Expected: v22.0.0 or higher
```

On Node 20 or older, upgrade Node.js via `nvm install 22` or NodeSource.

---

## 2. Local Inference & AI Failover Router

### Ollama / vLLM / LM Studio shows `offline` in AI Failover Router

1. Confirm your local inference server is running and listening:
   - Ollama: `curl http://127.0.0.1:11434/api/tags`
   - vLLM: `curl http://127.0.0.1:8000/v1/models`
   - LM Studio: `curl http://127.0.0.1:1234/v1/models`
2. If running Veritas inside Docker while Ollama runs on the host machine, set `OLLAMA_BASE_URL=http://host.docker.internal:11434` (Linux containers may also need `--add-host=host.docker.internal:host-gateway`).
3. Click **Probe Local Servers** in **AI Failover Router** or run:

   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/ai-routing/probe
   ```

### Cloud provider returned `402 Payment Required` / `QUOTA_EXCEEDED`

This is normal and handled automatically. Veritas places that tier on cooldown, fires an administrator alert, switches to local statistical + local LLM inference, and queues optional cloud enrichment jobs (fact-checking, live web lookup). Once topped up, reset cooldown and replay queued jobs:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/ai-routing/queue/process
```

---

## 3. Reverse Proxy, Uploads & SSE Streaming

### Large document or video uploads return HTTP `413 Payload Too Large`

1. Increase your Nginx proxy body limit (`client_max_body_size 100M;` — already configured in [`examples/nginx-reverse-proxy.conf`](../examples/nginx-reverse-proxy.conf)) or Kubernetes annotation `nginx.ingress.kubernetes.io/proxy-body-size: "100m"`.
2. Ensure `VERITAS_MAX_FILE_BYTES` matches or exceeds your desired upload limit.

### Batch job progress bar stays stuck while reverse-proxied

Nginx buffers responses by default, delaying Server-Sent Events (`/api/v1/jobs/:id/stream`). Ensure `proxy_buffering off;` and `X-Accel-Buffering: no;` are active on `/api/` routes (included in [`examples/nginx-reverse-proxy.conf`](../examples/nginx-reverse-proxy.conf) and [`k8s/ingress.yaml`](../k8s/ingress.yaml)).

---

## 4. Authentication & CSRF Errors

### API client receives `401 Unauthorized`

When `VERITAS_REQUIRE_AUTH=true`, include an issued token via `x-api-key: vrt_live_...` or `Authorization: Bearer vrt_live_...`.

### Browser receives `403 Cross-origin state-mutating request rejected`

Add your frontend domain to `VERITAS_ALLOWED_ORIGINS` (e.g. `https://veritas.example.com`) and restart the server.

---

## 5. Frequently Asked Questions (FAQ)

- **Does Veritas work 100% offline with zero API keys?**
  Yes. Statistical stylometry, perplexity/burstiness analysis, adversarial evasion defense, code AST fingerprinting, Ed25519 proof minting/verification, readability, SEO/GEO, and `.docx`/`.zip` exports require zero external network calls.
- **Does PII ever reach external AI providers?**
  Not by default (`local-only` mode blocks outbound cloud AI completely). In `hybrid-verified` mode, the PII Airlock strips emails, phone numbers, government IDs, IPs, and card numbers before transmission.
- **Can I delete my data?**
  Yes — `POST /api/v1/privacy/erasure` or the **System -> Privacy & API** workspace permanently deletes records, proofs, and profiles.
