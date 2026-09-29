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

### Production bootstrap

```bash
cd server/packages/api && bun run bootstrap    # Prepare a fresh deployment
cd server/packages/api && bun run deploy:prepare # Wait for the database, migrate, then bootstrap
```

`db:seed` fills a disposable local database with demo data. A deployment runs `bootstrap` after migrations instead. It installs the model and tool catalog, creates the first owner (`BOOTSTRAP_OWNER_EMAIL`) with an organization (`BOOTSTRAP_ORGANIZATION_NAME`) and a default project, and adds a starter workflow if that organization has never had a workflow, so an archived starter stays archived. Each step skips what already exists, so it is safe to run on every deploy. The owner signs in with an email code, so sign-up can stay disabled.

The API sends sign-in codes as `AUTH_EMAIL_DELIVERY` says: `resend` emails them (set `RESEND_API_KEY` and `TRANSACTIONAL_EMAIL_ADDRESS`), and `log` writes them to the API log. Anyone who can read the log can sign in as anyone, so use `log` only locally or when you are the only person with access to the deployment's logs.

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
cd server
bun install --frozen-lockfile
bun run --filter arcnem-vision-docs dev         # Docs site on :4321
```
