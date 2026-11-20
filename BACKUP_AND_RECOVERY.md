# Backup, Restore & Disaster Recovery Guide

Follow these procedures to protect Veritas scan history, Ed25519 proof bundles, RBAC users, API key hashes, citations, and audit logs.

---

## 1. Recovery Objectives

| Deployment Tier | Recommended Backup Frequency | Target RPO | Target RTO |
| :--- | :--- | :--- | :--- |
| Single-Node JSON Store | Hourly / Pre-Upgrade snapshot | <= 1 hour | < 5 minutes |
| Docker Compose + PostgreSQL | Daily `pg_dump` + WAL / hourly snapshots | <= 15 minutes | < 15 minutes |
| Kubernetes Stateful PVC | Scheduled VolumeSnapshot + DB dump | <= 15 minutes | < 10 minutes |

---

## 2. Local Node / Single-Container Backup (JSON Store)

All application records live in `${VERITAS_DATA_DIR:-./data}/veritas-store.json`.

### Create a Verified Backup
```bash
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ./backups
cp ./data/veritas-store.json "./backups/veritas-store-${TIMESTAMP}.json"
sha256sum "./backups/veritas-store-${TIMESTAMP}.json" > "./backups/veritas-store-${TIMESTAMP}.json.sha256"
```

### Restore from Backup
```bash
sha256sum -c ./backups/veritas-store-20261120T090000Z.json.sha256
# Stop Veritas before swapping the store file to prevent concurrent writes
cp ./backups/veritas-store-20261120T090000Z.json ./data/veritas-store.json
```

---

## 3. Docker Compose Backup & Restore

### Backup Named Volumes + PostgreSQL
```bash
# Dump PostgreSQL schema & data
docker compose exec -T postgres pg_dump -U veritas -d veritas > "backups/veritas_pg_$(date +%F).sql"

# Archive /app/data volume
docker run --rm \
  -v veritas_veritas_data:/source:ro \
  -v "$(pwd)/backups:/backup" \
  alpine tar czf "/backup/veritas_data_$(date +%F).tar.gz" -C /source .
```

### Restore Docker Compose Volumes
```bash
docker compose down
docker run --rm \
  -v veritas_veritas_data:/target \
  -v "$(pwd)/backups:/backup:ro" \
  alpine sh -c "rm -rf /target/* && tar xzf /backup/veritas_data_2026-11-20.tar.gz -C /target"
docker compose up -d postgres
cat backups/veritas_pg_2026-11-20.sql | docker compose exec -T postgres psql -U veritas -d veritas
docker compose up -d
```

---

## 4. Kubernetes Disaster Recovery Runbook

1. **Snapshot PVC Before Upgrades**:
   ```bash
   kubectl -n veritas exec deploy/veritas-app -- cat /app/data/veritas-store.json > veritas-k8s-backup.json
   ```
2. **Full Cluster Re-Hydration**:
   ```bash
   kubectl apply -f k8s/secret.yaml
   kubectl apply -k k8s/
   kubectl -n veritas wait --for=condition=ready pod -l app=veritas-app --timeout=120s
   ```
3. **Restore Data into Pod PVC**:
   ```bash
   POD=$(kubectl -n veritas get pod -l app=veritas-app -o jsonpath='{.items[0].metadata.name}')
   kubectl -n veritas cp veritas-k8s-backup.json "${POD}:/app/data/veritas-store.json"
   kubectl -n veritas rollout restart deployment/veritas-app
   ```

---

## 5. Post-Restore Smoke Verification

After any restore:
1. `curl -sf http://127.0.0.1:3000/api/health` -> expects `{"status":"ok",...}`
2. Verify `/api/v1/history`, `/api/v1/proofs`, and `/api/v1/audit-logs` return expected counts.
3. Verify one existing `.veritas-proof.json` via `POST /api/v1/proofs/verify`.
