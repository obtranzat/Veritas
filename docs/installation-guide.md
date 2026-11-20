# Installation Guide (Windows, macOS, Linux & Docker)

Veritas runs cleanly on **Linux**, **macOS**, and **Windows 10/11**.

---

## System Requirements

| Resource | Minimum (Local OSS) | Recommended (Production + Batch Media) |
| :--- | :--- | :--- |
| **Node.js** | `22.0.0` or newer | `22.x LTS` |
| **RAM** | 2 GB | 4–8 GB (16 GB+ if co-hosting Ollama models) |
| **Disk** | 500 MB free | 10 GB+ SSD for uploads, logs, & Docker volumes |

---

## 1. Linux (Ubuntu / Debian / RHEL / Fedora)

```bash
# Install Node.js 22 LTS (Ubuntu/Debian example via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential

# Verify Node >= 22
node -v

# Clone & install Veritas
git clone https://github.com/veritas-oss/veritas.git
cd veritas
npm install --legacy-peer-deps
cp .env.example .env

# Run in development or build for production
npm run dev
```

Production startup:
```bash
npm run build
NODE_ENV=production npm start
```

---

## 2. macOS (Apple Silicon & Intel)

```bash
# Using Homebrew
brew install node@22 git
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

git clone https://github.com/veritas-oss/veritas.git
cd veritas
npm install --legacy-peer-deps
cp .env.example .env
npm run dev
```

---

## 3. Windows 10 / 11 (PowerShell or WSL2)

### Option A: Native PowerShell
1. Install **Node.js 22 LTS** from https://nodejs.org and **Git for Windows**.
2. Open PowerShell:
   ```powershell
   git clone https://github.com/veritas-oss/veritas.git
   cd veritas
   npm install --legacy-peer-deps
   Copy-Item .env.example .env
   npm run dev
   ```
3. Production start in PowerShell:
   ```powershell
   npm run build
   $env:NODE_ENV="production"; npm start
   ```

### Option B: WSL2 (Recommended for Docker & Ollama on Windows)
Follow the Ubuntu Linux instructions inside your WSL2 terminal, or run `docker compose up -d --build` via Docker Desktop.

---

## 4. Docker (Single Container)

```bash
# Production image
docker build -f Dockerfile.prod -t veritas:3.0.0 .
docker run -d \
  --name veritas \
  -p 3000:3000 \
  -v veritas_data:/app/data \
  --env-file .env \
  veritas:3.0.0
```

---

## 5. Docker Compose (Full Stack with Postgres, Redis, Whisper & Ollama)

```bash
cp .env.example .env
# Edit .env and set a strong POSTGRES_PASSWORD
docker compose up -d --build
```

Check container health:
```bash
docker compose ps
curl http://127.0.0.1:3000/api/health
```
