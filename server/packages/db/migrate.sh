#!/bin/bash
set -e

echo "Running migrations..."

# Retry logic for migrations in case Postgres isn't ready yet
MAX_RETRIES=30
RETRY_COUNT=0

# Custom migration runner - bypasses drizzle-kit's broken dynamic import resolution
until bun run /app/packages/db/runMigrations.ts 2>&1; do
  EXIT_CODE=$?
  RETRY_COUNT=$((RETRY_COUNT+1))

  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Failed to run migrations after $MAX_RETRIES attempts"
    exit $EXIT_CODE
  fi

  echo "Attempt $RETRY_COUNT/$MAX_RETRIES: Migration failed (possibly waiting for Postgres), retrying in 2 seconds..."
  sleep 2
done

echo "Migrations completed successfully!"
