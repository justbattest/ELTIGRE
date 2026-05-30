# ─────────────────────────────────────────────────────────────────────────────
# emma-content-pipeline — Dockerfile pour déploiement Render.com
#
# Architecture : Node.js 20 + Python 3 + Higgsfield CLI + ffmpeg
# Chemins importants une fois déployé :
#   /app/venv/bin/python  ← Python pipeline
#   /app/pipeline/        ← Modules Python
#   /app/webapp/          ← Next.js app (process.cwd() au runtime)
#   /tmp/                 ← Fichiers temporaires des runs
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim

# ── Dépendances système ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Higgsfield CLI ────────────────────────────────────────────────────────────
RUN npm install -g higgsfield

# ── Répertoire de travail ─────────────────────────────────────────────────────
WORKDIR /app

# ── Python venv + dépendances ─────────────────────────────────────────────────
# Copier requirements avant le reste pour profiter du cache Docker
COPY requirements.txt .
RUN python3 -m venv venv && \
    venv/bin/pip install --no-cache-dir --upgrade pip && \
    venv/bin/pip install --no-cache-dir -r requirements.txt

# ── Pipeline Python ───────────────────────────────────────────────────────────
COPY pipeline/ pipeline/

# ── Next.js webapp ────────────────────────────────────────────────────────────
COPY webapp/ webapp/

WORKDIR /app/webapp

# Installer les dépendances Node (sans devDeps en prod)
RUN npm ci

# Générer le client Prisma (nécessaire avant le build)
RUN npx prisma generate

# Build Next.js (produit .next/)
RUN npm run build

# ── Port & démarrage ──────────────────────────────────────────────────────────
EXPOSE 3000

# npm start lance "next start" depuis /app/webapp
CMD ["npm", "start"]
