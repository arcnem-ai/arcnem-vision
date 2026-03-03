---
title: Getting Started
description: Clone, configure, and run Arcnem Vision locally.
---

:::tip[Two API keys — that's all you need]
Arcnem Vision only requires an [OpenAI API key](https://platform.openai.com/api-keys) and a [Replicate API token](https://replicate.com/account/api-tokens) to get started. Everything else — Postgres, Redis, S3 (MinIO), Inngest — runs locally via Docker Compose. The `.env.example` defaults point to them out of the box.
:::

## Prerequisites

- Docker + Docker Compose
- Bun (server)
- Go 1.25+ (agents, MCP)
- CompileDaemon (Go hot reload — `go install github.com/githubnemo/CompileDaemon@latest`)
- Flutter SDK (client)
- Tilt

## 1. Clone and configure

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

Copy every `.env.example` to `.env`:

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

Add your two API keys — the only external services required:

- **[OpenAI API key](https://platform.openai.com/api-keys)** → `OPENAI_API_KEY` in `models/agents/.env`
- **[Replicate API token](https://replicate.com/account/api-tokens)** → `REPLICATE_API_TOKEN` in `models/mcp/.env`

Everything else is already configured for local development. Database, S3, and Redis all run in Docker via `docker-compose.yaml` — the `.env.example` defaults point to them out of the box.

## 2. Start everything

```bash
tilt up
```

That's it. Tilt installs all dependencies, starts Postgres/Redis/MinIO, runs migrations, and launches every service — API, dashboard, agents, MCP, Inngest, Flutter client, and the docs site. Open the Tilt UI at `http://localhost:10350` to watch logs and manage resources.

## 3. Seed the database

In the Tilt UI, click the **seed-database** resource and hit the trigger button. The seed prints a usable API key — set `DEBUG_SEED_API_KEY=...` in `client/.env` for auto-auth in the Flutter app during development.

## Health checks

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## S3 config details

Default local dev uses MinIO from `docker-compose.yaml`. The `.env.example` files ship with working defaults:

- `S3_ACCESS_KEY_ID=minioadmin`
- `S3_SECRET_ACCESS_KEY=minioadmin`
- `S3_BUCKET=arcnem-vision`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_REGION=us-east-1`
- `S3_USE_PATH_STYLE=true` (agents only)

For hosted storage, substitute your AWS S3, Cloudflare R2, Railway Object Storage, or Backblaze B2 credentials.
