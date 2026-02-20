---
title: Getting Started
description: Clone, configure, and run Arcnem Vision locally.
---

## Prerequisites

- Docker + Docker Compose
- Bun (server)
- Go 1.25+ (agents, MCP)
- CompileDaemon (Go hot reload for `tilt up`)
- Flutter SDK (client)
- Inngest CLI (`npx inngest-cli@latest`)
- Hosted S3-compatible object storage bucket (S3 / R2 / Railway / etc.)
- Tilt (recommended)

## 1. Clone and install

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

```bash
cd server && bun i            # TypeScript dependencies
cd models && go work sync     # Go workspace
cd client && flutter pub get  # Flutter packages
```

## 2. Configure environment

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

You'll need:
- **Hosted S3-compatible bucket** — endpoint, bucket, and credentials in `server/packages/api/.env` and `models/agents/.env` (for example AWS S3, Cloudflare R2, Railway Object Storage)
- **OpenAI API key** — `OPENAI_API_KEY` in `models/agents/.env`
- **Replicate token** — `REPLICATE_API_TOKEN` in `models/mcp/.env`
- **Database URL** — `postgres://postgres:postgres@localhost:5480/postgres` in the DB-related env files

## 3. Start infrastructure

```bash
docker compose up -d postgres redis
```

## 4. Migrate and seed

```bash
cd server/packages/db && bun run db:generate && bun run db:migrate && bun run db:seed
```

The seed prints a usable API key. For auto-auth in the Flutter app during development, set `DEBUG_SEED_API_KEY=...` in `client/.env`.

## 5. Run everything

**One command** (recommended):

```bash
tilt up
```

`tilt up` launches the full local stack and gives you the Tilt UI (typically `http://localhost:10350`) to inspect logs and run manual resources such as seed/introspection tasks.

**Or manually** — run each in a separate terminal:

```bash
cd server/packages/api && bun run dev                    # API on :3000
cd server/packages/dashboard && bun run dev              # Dashboard on :3001
cd models/agents && go run .                             # Agents on :3020
cd models/mcp && go run .                                # MCP on :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest  # Job queue
cd client && flutter run -d chrome                       # Flutter client
```

## Health checks

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
