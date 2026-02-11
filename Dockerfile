# Phantom Node V10 — USD/JPY Day Trading Algo
# High-performance day trading with 1-5 trades per day

FROM node:20-bookworm-slim

# Python 3 + venv for the algo (PEP 668–compliant) + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Node deps (include dev for build + concurrently at start)
COPY package.json package-lock.json ./
RUN npm ci

# Python venv + algo deps
COPY python_algo/requirements.txt ./python_algo/
RUN python3 -m venv /app/venv \
    && /app/venv/bin/pip install --no-cache-dir -r python_algo/requirements.txt
ENV PATH="/app/venv/bin:$PATH"

# App source and build
COPY . .
RUN npm run build

EXPOSE 3000

# Pass OANDA_* (and optional DISCORD_WEBHOOK_URL) via env when running the container.
CMD ["npm", "run", "start:all"]
