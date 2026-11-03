#!/bin/sh
# Container entrypoint: make the data volume writable, then drop to the unprivileged
# "node" user, apply migrations and start the API (+ worker when RUN_WORKER_IN_API=true).
set -e

if [ "$DB_PROVIDER" = "postgres" ]; then
  export PRISMA_SCHEMA=prisma/postgres/schema.prisma
  export PRISMA_MIGRATIONS=prisma/postgres/migrations
else
  # SQLite lives on a persistent disk mounted at /data (see docs/DEPLOYMENT.md).
  mkdir -p /data
  if [ "$(id -u)" = "0" ]; then chown -R node:node /data; fi
fi

run() {
  if [ "$(id -u)" = "0" ]; then exec setpriv --reuid=node --regid=node --init-groups "$@"; else exec "$@"; fi
}

run sh -c "npx prisma migrate deploy && node dist/server.js"
