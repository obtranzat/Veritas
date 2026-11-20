# Veritas Production Deployment Guide

Veritas is stateless at the HTTP tier and stores runtime state in `/app/data` (or PostgreSQL + Redis when scaled). Follow the target platform section below to go from clean clone to HTTPS production.

> **Security Checklist Before Exposure**
> 1. Set `NODE_ENV=production` and `VERITAS_REQUIRE_AUTH=true`.
> 2. Issue an initial Admin key (`POST /api/v1/keys`) over localhost/private network before exposing port `3000` publicly.
> 3. Configure `APP_URL` and `VERITAS_ALLOWED_ORIGINS` to your exact HTTPS origin.
> 4. Mount persistent storage at `/app/data` so proofs, keys, profiles, and history survive container restarts.

---

## 1. Docker (Single Container)

### Standard Image (`Dockerfile`)

```bash
docker build -t veritas:3.0.0 .
docker run -d \
  --name veritas \
  -p 3000:3000 \
  --env-file .env \
  -v veritas_data:/app/data \
  --restart unless-stopped \
  veritas:3.0.0
```

### Multi-Stage Minimal Production Image (`Dockerfile.prod`)

Produces a lean Alpine runtime image with only production dependencies and compiled `dist/` assets:

```bash
docker build -f Dockerfile.prod -t veritas:3.0.0-prod .
docker run -d \
  --name veritas-prod \
  -p 3000:3000 \
  --env-file .env \
  -v veritas_data:/app/data \
  --security-opt no-new-privileges:true \
  veritas:3.0.0-prod
```

---

## 2. Docker Compose (Full AI & Database Stack)

The bundled [`docker-compose.yml`](../docker-compose.yml) provisions:
- **Veritas App** (`:3000`)
- **PostgreSQL 16** (pre-loaded with [`schema.sql`](../schema.sql))
- **Redis 7** (queue coordination)
- **Whisper ASR** (local speech-to-text)
- **Ollama** (local Llama / Qwen / DeepSeek / Mistral / Gemma inference)

```bash
cp .env.example .env
# Optional: edit .env with database password or local inference overrides
docker compose up -d --build

# Pull a local model into Ollama (optional but recommended for offline AI)
docker compose exec ollama ollama pull llama3.2
```

Verify health:

```bash
curl -sf http://127.0.0.1:3000/api/health
```

---

## 3. Kubernetes (`k8s/`)

Ready-to-apply Kustomize manifests live in [`k8s/`](../k8s/kustomization.yaml).

1. **Create your real secret from the template (never commit `k8s/secret.yaml`):**

   ```bash
   cp k8s/secret.example.yaml k8s/secret.yaml
   # Edit k8s/secret.yaml with strong base64/stringData values
   ```

2. **Edit domain & StorageClass if needed** in [`k8s/configmap.yaml`](../k8s/configmap.yaml) and [`k8s/ingress.yaml`](../k8s/ingress.yaml). Note that the Ingress explicitly enables:
   - `nginx.ingress.kubernetes.io/proxy-body-size: "100m"` (large file uploads)
   - `nginx.ingress.kubernetes.io/proxy-buffering: "off"` (SSE streaming `/api/v1/jobs/:id/stream`)

3. **Apply to cluster:**

   ```bash
   kubectl apply -k k8s/
   kubectl -n veritas rollout status deployment/veritas-app
   ```

---

## 4. Linux VPS (Ubuntu/Debian + systemd + Nginx TLS)

1. **Install Node.js 22 & system utilities:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git ffmpeg tesseract-ocr nginx certbot python3-certbot-nginx
   ```

2. **Clone & build into `/opt/veritas`:**

   ```bash
   sudo git clone https://github.com/obtranzat/Veritas.git /opt/veritas
   cd /opt/veritas
   npm ci && npm run build
   cp .env.example .env
   ```

3. **Create `/etc/systemd/system/veritas.service`:**

   ```ini
   [Unit]
   Description=Veritas Content Intelligence Platform
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/veritas
   EnvironmentFile=/opt/veritas/.env
   Environment=NODE_ENV=production
   ExecStart=/usr/bin/node /opt/veritas/server.ts
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable service & attach Nginx reverse proxy + TLS:**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now veritas
   sudo cp /opt/veritas/examples/nginx-reverse-proxy.conf /etc/nginx/sites-available/veritas
   sudo ln -s /etc/nginx/sites-available/veritas /etc/nginx/sites-enabled/veritas
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d veritas.example.com
   ```

---

## 5. Cloud Providers

### AWS (ECS Fargate / EKS)

- **EKS**: Apply `k8s/` manifests with an EFS-backed StorageClass if scaling replicas > 1, or `ReadWriteOnce` EBS for single-writer workloads + AWS ALB Ingress Controller.
- **ECS Fargate**: Build and push `Dockerfile.prod` to Amazon ECR; allocate at least `1 vCPU / 2 GB RAM`, mount `/app/data` to Amazon EFS, set `PORT=3000`, and point the ALB Target Group health check at `GET /api/health`.

### Google Cloud (Cloud Run / GKE)

- **Cloud Run**:

  ```bash
  gcloud builds submit --tag gcr.io/PROJECT_ID/veritas:3.0.0 -f Dockerfile.prod .
  gcloud run deploy veritas \
    --image gcr.io/PROJECT_ID/veritas:3.0.0 \
    --port 3000 \
    --memory 2Gi \
    --cpu 2 \
    --set-env-vars "NODE_ENV=production,VERITAS_REQUIRE_AUTH=true"
  ```

  Attach a Cloud Storage FUSE volume or Managed PostgreSQL for durable persistence across revisions.
- **GKE**: `kubectl apply -k k8s/` directly works on GKE Standard and Autopilot.

### Azure (Container Apps / AKS)

- **Azure Container Apps**: Push `Dockerfile.prod` to ACR, deploy with ingress target port `3000`, Azure Files mount at `/app/data`, and HTTP probe on `/api/health`.
- **AKS**: `kubectl apply -k k8s/` with `managed-csi` StorageClass.

### DigitalOcean (App Platform / Droplet)

- **App Platform**: Connect your GitHub fork, select **Dockerfile (`Dockerfile.prod`)**, set HTTP port `3000`, health check path `/api/health`, and configure environment variables in the dashboard.
- **Droplet**: Follow the **Linux VPS** instructions above on a 2 vCPU / 4 GB Ubuntu 24.04 Droplet.
