---
title: Commands
description: Common development commands for each service.
---

## Running Services

```bash
tilt up
```

Tilt installs dependencies, starts infrastructure, runs migrations, and launches all services. Open the Tilt UI at `http://localhost:10350` for logs and manual resource triggers (seed, introspection).

## Database

```bash
cd server/packages/db && bun run db:generate   # Generate migrations
cd server/packages/db && bun run db:migrate    # Apply migrations
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # Seed data
```

Tilt runs `db:generate` and `db:migrate` automatically on startup. Seed and introspection are available as manual triggers in the Tilt UI.

## Go Model Generation

After schema changes, regenerate Go models from the Drizzle-managed Postgres schema:

```bash
cd models/db && go run ./cmd/introspect
```

Also available as a manual trigger in the Tilt UI.

## Linting & Analysis

```bash
cd server && bunx biome check packages         # TypeScript lint/format
```

## Testing

```bash
cd server && bun test                          # API and shared contract tests
```

## Documentation Site

Started automatically by `tilt up`, or run standalone:

```bash
cd site && bun run dev                         # Docs site on :4321
```
