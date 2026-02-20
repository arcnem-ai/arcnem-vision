---
title: Commands
description: Common development commands for each service.
---

## Database

```bash
cd server/packages/db && bun run db:generate   # Generate migrations
cd server/packages/db && bun run db:migrate    # Apply migrations
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # Seed data
```

## Go Model Generation

After schema changes, regenerate Go models from the Drizzle-managed Postgres schema:

```bash
cd models/db && go run ./cmd/introspect
```

## Linting & Analysis

```bash
cd server && bunx biome check packages         # TypeScript lint/format
cd client && flutter analyze                   # Dart static analysis
```

## Testing

```bash
cd client && flutter test                      # Flutter widget tests
```

## Running Services

**One command** (recommended):

```bash
tilt up
```

Tilt UI is usually available at `http://localhost:10350` (logs + manual resources).

**Or manually:**

```bash
cd server/packages/api && bun run dev          # API on :3000
cd server/packages/dashboard && bun run dev    # Dashboard on :3001
cd models/agents && go run .                   # Agents on :3020
cd models/mcp && go run .                      # MCP on :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest
cd client && flutter run -d chrome             # Flutter client
```

## Documentation Site

```bash
cd site && bun run dev                         # Docs site on :4321 (default Astro dev port)
```
