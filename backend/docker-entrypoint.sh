#!/bin/sh
set -e

# Ensure the data directories exist on the mounted volume
mkdir -p "$(dirname "$DB_PATH")" "$UPLOADS_DIR"

# If Litestream is configured and the local database is missing (fresh volume),
# restore the most recent backup from R2 before starting.
if [ -n "$LITESTREAM_REPLICA_URL" ] && [ ! -f "$DB_PATH" ]; then
  echo "No local database found — attempting restore from R2 backup…"
  litestream restore -if-replica-exists "$DB_PATH" || echo "No backup to restore (first run) — starting fresh."
fi

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  # Run the app under Litestream so every change is replicated to R2.
  exec litestream replicate -exec "node src/app.js"
else
  # No backup configured (e.g. local) — just run the app.
  echo "Litestream not configured — running without off-site backup."
  exec node src/app.js
fi
