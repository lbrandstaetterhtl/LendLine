# LendLine in one image: nginx serves the frontend on port 9000 and forwards /api to the API, which
# (as everywhere else) only listens on loopback. Database: see docker-compose.yml.
#
#   docker compose up -d --build      → http://localhost:9000

# ---- frontend: static build
FROM node:24-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- backend: Prisma client and compiled API
FROM node:24-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

# ---- runtime
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx openssl \
    && rm -rf /var/lib/apt/lists/*
# The dev dependencies stay: the entrypoint runs `prisma migrate deploy` and, on request, the seed (tsx).
COPY --from=backend --chown=node:node /app/backend /app/backend
COPY --from=frontend /app/frontend/dist /app/frontend
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/lendline-entrypoint
RUN chmod 755 /usr/local/bin/lendline-entrypoint \
    && mkdir -p /app/backend/uploads && chown node:node /app/backend/uploads

ENV PORT=3001
USER node
WORKDIR /app/backend
EXPOSE 9000
VOLUME /app/backend/uploads
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:9000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["lendline-entrypoint"]
