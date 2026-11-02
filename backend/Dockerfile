# DueOra API + notification worker — production image (PostgreSQL).
# Build:  docker build -t dueora-api ./backend
# Run:    docker run -p 4000:4000 --env-file .env dueora-api

# ---- 1. Dependencies (incl. dev, for building) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# prisma.config.ts needs a DATABASE_URL to load; nothing connects during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    PRISMA_SCHEMA=prisma/postgres/schema.prisma
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- 2. Build: Postgres Prisma client + TypeScript ----
FROM deps AS build
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ---- 3. Runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    PRISMA_SCHEMA=prisma/postgres/schema.prisma \
    PRISMA_MIGRATIONS=prisma/postgres/migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. The worker runs in-process when RUN_WORKER_IN_API=true,
# or as a separate service with: node dist/worker.js
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
