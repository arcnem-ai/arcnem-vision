# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arcnem Vision is a multi-service computer vision platform with a Flutter client, a Bun/Hono API server, a React admin dashboard, and Go-based agent/MCP services. Documents (images) are uploaded via presigned S3 URLs, processed by LangGraph-orchestrated agents using Inngest, and stored with pgvector CLIP embeddings for similarity search.

## Architecture

**Three-tier monorepo:**
- `client/` — Flutter app (Dart). Auth via API key. GenUI chat interface with on-device Gemma for intent parsing, camera capture, document gallery. Uses `fpdart` for functional error handling, `flutter_gemma` for on-device LLM, `genui` for dynamic UI composition.
- `server/` — Bun workspace with four packages:
  - `packages/api/` — Hono HTTP server with better-auth (email+password, API keys, organizations). Routes mounted at `/api`. Inngest handler at `/api/inngest`. Middleware: CORS, request ID, pino logging, session extraction, S3/Inngest/DB client injection.
  - `packages/db/` — Drizzle ORM schema and migrations against pgvector/pg18. Schema split into `authSchema.ts` (users, orgs, projects, devices, apikeys), `projectSchema.ts` (documents, embeddings, descriptions, models, presigned uploads), and `agentGraphSchemas.ts` (tools, templates, graphs, nodes, edges, runs, steps). Relationships defined in `relationships.ts`.
  - `packages/dashboard/` — React admin UI with TanStack Router, Tailwind CSS, and shadcn/ui. Workflow/graph editor and document viewer. Uses Vite + React 19.
  - `packages/shared/` — Shared env var helpers (`createEnvVarGetter` pattern).
- `models/` — Go workspace (`go.work`) with modules:
  - `agents/` — Gin server exposing Inngest job handlers. `process-document-upload` loads a document's agent graph from DB, builds a LangGraph workflow (worker/tool/supervisor nodes), and executes it with step-level tracing. Uses LangChain Go for LLM calls, MCP client SDK for tool invocation, GORM for DB, S3 for object storage.
  - `mcp/` — MCP server with 5 registered tools: `create_document_embedding` (image → CLIP via Replicate), `create_description_embedding` (text → CLIP), `create_document_description` (save LLM description), `find_similar_documents` (pgvector cosine search), `find_similar_descriptions` (pgvector cosine search). Uses Replicate API for OpenAI/CLIP embeddings (768 dimensions).
  - `db/` — GORM gen introspection tool that generates Go models from the Drizzle-managed Postgres schema. Generated code in `gen/models/` and `gen/queries/`.
  - `cli/` — Bubble Tea TUI (stub).
  - `shared/` — Common env loading via godotenv.

**Key data flow:** Client uploads → API creates presigned S3 URL → Client uploads to hosted S3 → Client acks upload → Inngest event triggers Go agent job → Agent loads document + graph config from DB → LangGraph executes graph (workers call LLMs, tools call MCP) → MCP tools generate CLIP embeddings and descriptions → Stored in Postgres with pgvector HNSW indexes.

**Agent graph system:** Graphs are defined in the database with a template/instance pattern. Templates define reusable workflows (entry node, state schema, nodes, edges, tools). Instances bind templates to organizations. Nodes have types: `worker` (ReAct agent with tools), `tool` (single MCP tool call with input/output mapping), `supervisor` (multi-agent orchestration). Execution is traced in `agent_graph_runs` and `agent_graph_run_steps`.

**Auth model:** better-auth with API key plugin. API keys are scoped to org/project/device, stored as SHA-256 hashes. Flutter client authenticates via API key verification. Redis used as secondary session storage. Dashboard uses session-based auth.

## Development Commands

### Full Stack (recommended)
```
docker compose up -d postgres redis
tilt up
```

Tilt UI is typically available at `http://localhost:10350` (service logs + manual resources like seed/introspection).

### Individual Services
```bash
# Server API (Bun + Hono)
cd server && bun i
cd server/packages/api && bun run dev

# Dashboard (React + TanStack)
cd server/packages/dashboard && bun run dev    # Dashboard on :3001

# Database
cd server/packages/db && bun run db:generate   # Generate migration files
cd server/packages/db && bun run db:migrate    # Apply migrations
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # Seed local data

# Go services (use CompileDaemon in Tilt, or run directly)
cd models/agents && go run .
cd models/mcp && go run .

# Go model generation (after schema changes)
cd models/db && go run ./cmd/introspect

# Flutter client
cd client && flutter pub get
cd client && flutter run -d chrome
```

### Linting & Analysis
```bash
cd server && bunx biome check packages         # TS lint/format
cd client && flutter analyze                    # Dart static analysis
```

### Testing
```bash
cd client && flutter test                       # Flutter widget tests
```

## Code Style

- **TypeScript:** Biome — tabs, double quotes, import organization. Config at `server/biome.json`.
- **Dart:** `flutter_lints`. UpperCamelCase for classes, lowerCamelCase for fields/methods. `fpdart` Either/TaskEither for async error handling.
- **Go:** `gofmt`. Packages organized by feature (clients/, jobs/, graphs/, server/, tools/).

## Infrastructure Defaults

| Service   | Host Port | Container Port |
|-----------|-----------|----------------|
| Postgres  | 5480      | 5432           |
| Redis     | 6381      | 6379           |
| API       | 3000      | —              |
| Dashboard | 3001      | —              |
| Agents    | 3020      | —              |
| MCP       | 3021      | —              |

Postgres uses `pgvector/pgvector:pg18` image with logical replication enabled.

## Local Dev Prerequisites

- Docker + Docker Compose
- Bun
- Go 1.25+
- Flutter SDK
- Tilt
- Hosted S3-compatible storage (endpoint, bucket, credentials; S3 / R2 / Railway / etc.)
- Inngest CLI (`npx inngest-cli@latest` or local install)
- CompileDaemon for Go hot compile/restart (`go install github.com/githubnemo/CompileDaemon@latest`)

## Environment

Each service has its own `.env` (copy from `.env.example`):
- `server/packages/api/.env` — S3, Inngest, better-auth secrets, Redis
- `server/packages/db/.env` — DATABASE_URL
- `client/.env` — API_URL, CLIENT_ORIGIN, DEBUG_SEED_API_KEY
- `models/agents/.env` — DATABASE_URL, S3, OPENAI_API_KEY, MCP_SERVER_URL, Inngest
- `models/mcp/.env` — REPLICATE_API_TOKEN, DATABASE_URL, MCP server name/version
- `models/db/.env` — DATABASE_URL

## Schema Notes

- All primary keys use UUIDv7 (time-ordered).
- Embeddings are 768-dimensional vectors (CLIP via Replicate) with HNSW cosine indexes.
- Documents link to organizations, projects, and devices.
- Document descriptions are LLM-generated text representations, also embedded for similarity search.
- Agent graphs use a template/instance pattern: `agent_graph_templates` → `agent_graphs`, with nodes, edges, and tools at both levels.
- Execution tracing: `agent_graph_runs` (status, initial/final state, errors) → `agent_graph_run_steps` (per-node state deltas, ordered).
- Tools table stores reusable tool definitions with JSON input/output schemas.
- Models table tracks LLM providers and names with embedding dimension metadata.

## Key Dependencies

- **Server:** Hono, better-auth, Drizzle ORM, Inngest, Pino, Bun S3/Redis clients
- **Dashboard:** React 19, TanStack Router, Tailwind CSS, shadcn/ui, Vite
- **Client:** Flutter, flutter_gemma, genui, fpdart, flutter_secure_storage, camera
- **Agents:** Gin, inngestgo, langgraphgo, langchaingo, MCP go-sdk, GORM, AWS S3 SDK
- **MCP:** MCP go-sdk, replicate-go, GORM
