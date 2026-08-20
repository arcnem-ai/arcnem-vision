#!/bin/bash
set -euo pipefail

echo "Running migrations..."

MAX_RETRIES=30
RETRY_COUNT=0

while true; do
  set +e
  bun --cwd /app/packages/db -e '
    import { Client } from "pg";

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is required");
      process.exit(1);
    }

    try {
      const { protocol } = new URL(process.env.DATABASE_URL);
      if (protocol !== "postgres:" && protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use postgres:// or postgresql://");
      }
    } catch {
      console.error(
        "DATABASE_URL must be a valid postgres:// or postgresql:// URL",
      );
      process.exit(1);
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
    });

    try {
      await client.connect();
      await client.end();
    } catch (error) {
      const code = error?.code;
      const message = error?.message ?? String(error);
      console.error(code ? `${code}: ${message}` : message);
      const retryableCodes = new Set([
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ETIMEDOUT",
        "57P03",
      ]);
      const retryable =
        retryableCodes.has(code) || message === "timeout expired";
      process.exit(retryable ? 75 : 1);
    }
  '
  EXIT_CODE=$?
  set -e

  if [ $EXIT_CODE -eq 0 ]; then
    break
  fi

  if [ $EXIT_CODE -ne 75 ]; then
    echo "Database readiness check failed with a non-retryable error"
    exit $EXIT_CODE
  fi

  RETRY_COUNT=$((RETRY_COUNT+1))

  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Failed to run migrations after $MAX_RETRIES attempts"
    exit $EXIT_CODE
  fi

  echo "Attempt $RETRY_COUNT/$MAX_RETRIES: Database unavailable, retrying in 2 seconds..."
  sleep 2
done

bun run --cwd /app/packages/db db:migrate

echo "Migrations completed successfully!"
