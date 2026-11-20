# Veritas Migration & Upgrade Guide

This document covers upgrading between Veritas releases and migrating local JSON persistence (`data/veritas-store.json`) to PostgreSQL (`schema.sql`).

---

## 1. Upgrading Between Releases

### Pre-Upgrade Checklist

1. Export or back up your active data directory (`/app/data/veritas-store.json` or PostgreSQL dump) — see [`BACKUP_AND_RECOVERY.md`](../BACKUP_AND_RECOVERY.md).
2. Read [`CHANGELOG.md`](../CHANGELOG.md) for any new environment variables or policy defaults.
3. Verify Node.js runtime meets `>= 22.0.0` (`node -v`).

### Bare-Metal / VPS Upgrade Steps

```bash
# 1. Backup data directory
cp -a data data.backup.$(date +%Y%m%d)

# 2. Pull release tag
git fetch --tags
git checkout v3.0.0

# 3. Install dependencies and compile
npm ci
npm run build

# 4. Restart process
sudo systemctl restart veritas
curl -sf http://127.0.0.1:3000/api/health
```

### Docker Compose Upgrade Steps

```bash
docker compose pull
docker compose build --no-cache veritas
docker compose up -d
```

---

## 2. Version-Specific Notes (`v1.x / v2.x → v3.0.0`)

### Schema Additions in v3.0.0

`veritas-store.json` automatically hydrates backward-compatible defaults on startup (`loadStore()` in `src/server/store.ts`):
- Missing `aiRouting` blocks automatically initialize the 11-tier failover router, provider credit balances, alert inbox, and response cache settings.
- Existing `records`, `citations`, `proofs`, `authorProfiles`, `keys`, `plugins`, and `users` are preserved intact without manual transforms.

### Environment Variable Additions

Review [`.env.example`](../.env.example) if upgrading from `v2.x`:
- `VERITAS_OFFLINE_MODE`, `VERITAS_AI_STRATEGY`, `VERITAS_PREFERRED_LOCAL_FAMILY`, `OLLAMA_BASE_URL`, `VLLM_BASE_URL`, `LMSTUDIO_BASE_URL`, and `LOCAL_OPENAI_BASE_URL` control the 11-tier failover engine.
- `VERITAS_REQUIRE_AUTH=true` enforces `x-api-key` or `Authorization: Bearer vrt_...` authentication on `/api/v1/*`.

---

## 3. Migrating from Local JSON Store to PostgreSQL

For multi-replica clusters or high-volume institutional workloads:

1. Ensure PostgreSQL 16+ is running and initialize the schema:

   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```

2. Verify tables exist (`detection_records`, `citation_entries`, `author_profiles`, `veritas_proofs`, `api_keys`, `audit_logs`).
3. Keep `data/veritas-store.json` backed up as an immutable JSON archive or bulk-export records via `POST /api/v1/export/bulk` before switching replicas to shared Postgres storage.
