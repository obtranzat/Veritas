# Veritas Examples

Runnable integration examples for REST API clients, TypeScript/Python SDKs, Model Context Protocol (MCP), and production reverse proxies.

| File | Description |
| :--- | :--- |
| `api-curl.sh` | Shell script calling health, AI detection, adversarial security inspection, code forensics, Ed25519 proof mint/verify, and 11-tier AI routing status |
| `sdk-typescript.ts` | Zero-dependency Node 22+ TypeScript SDK client (`VeritasClient`) |
| `sdk-python.py` | Zero-dependency Python 3.9+ `VeritasClient` script using `urllib` |
| `mcp-client-config.json` | Claude Desktop / Cursor MCP configuration pointing to `/api/v1/mcp` |
| `nginx-reverse-proxy.conf` | Hardened production Nginx reverse proxy (TLS, 100MB uploads, SSE streaming support) |

## Quick Run

Start Veritas first:

```bash
npm run dev
```

Then run any example:

```bash
bash examples/api-curl.sh
npx tsx examples/sdk-typescript.ts
python3 examples/sdk-python.py
```
