# DueOra API + reminder worker — production image.
#
# Default: SQLite on a persistent disk mounted at /data (DATABASE_URL=file:/data/dueora.db).
# PostgreSQL instead:  docker build --build-arg DB_PROVIDER=postgres -t dueora-api ./backend
#
# Build:  docker build -t dueora-api ./backend
# Run:    docker run -p 4000:4000 -v dueora-data:/data --env-file .env dueora-api

ARG DB_PROVIDER=sqlite

# ---- 1. Dependencies (incl. dev, for building) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# prisma.config.ts needs a DATABASE_URL to load; nothing connects during the build.
ENV DATABASE_URL=file:/tmp/build.db
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- 2. Build: Prisma client for the chosen database + TypeScript ----
FROM deps AS build
ARG DB_PROVIDER
COPY . .
RUN if [ "$DB_PROVIDER" = "postgres" ]; then export PRISMA_SCHEMA=prisma/postgres/schema.prisma; fi \
 && npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ---- 3. Runtime ----
FROM node:22-bookworm-slim AS runtime
ARG DB_PROVIDER
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PROVIDER=${DB_PROVIDER} \
    DATABASE_URL=file:/data/dueora.db \
    RUN_WORKER_IN_API=true
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
COPY --chown=node:node docker/start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Starts as root only to make the mounted /data volume writable, then drops to "node".
CMD ["./start.sh"]
