<p align="center">
  <img src="arcnem-logo.svg" alt="Arcnem" width="120" />
</p>

<h1 align="center">Arcnem Vision</h1>

<p align="center">
  <strong>Teach machines to see. Let agents decide what to do about it.</strong>
</p>

<p align="center">
  <a href="README.ja.md">日本語</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="site/">Docs Site</a> ·
  <a href="docs/">Deep Dives</a>
</p>

---

Arcnem Vision is an open-source platform that turns images into understanding. Upload a photo from a Flutter app with on-device intelligence, and a swarm of AI agents — orchestrated by LangGraph, connected through MCP, and configured entirely from a database — will generate embeddings, write descriptions, and make everything searchable by meaning, not just metadata.

Four languages. Five services. One pipeline from camera shutter to semantic search.

**What makes it interesting:**

- **Database-driven agent graphs** — Define AI workflows as rows, not code. Swap processing pipelines per organization without redeploying anything.
- **GenUI chat interface** — The AI doesn't just reply with text. It generates real Flutter widgets at runtime — cards, galleries, interactive components — composed from JSON.
- **On-device Gemma** — Intent parsing happens locally on the phone before anything hits the network. Private by default.
- **CLIP vector search** — Images and their descriptions are embedded in the same 768-dimensional space. Search by image, by text, or by vibes.
- **Visual workflow builder** — A React dashboard where you drag-and-drop agent graphs: workers, tools, supervisors, edges, the whole thing.
- **MCP tools as a first-class primitive** — Five registered tools following the open Model Context Protocol standard. Agents call them. You can too.

## Tech Stack

| Layer         | Tech                                           | What it does                                                               |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| **Client**    | Flutter, Dart, flutter_gemma, GenUI, fpdart    | Camera capture, on-device LLM, AI-generated UI, functional error handling  |
| **API**       | Bun, Hono, better-auth, Inngest, Pino          | REST routes, presigned uploads, durable job scheduling, structured logging |
| **Dashboard** | React 19, TanStack Router, Tailwind, shadcn/ui | Workflow builder, document viewer, admin interface                         |
| **Agents**    | Go, Gin, LangGraph, LangChain, inngestgo       | Graph-based agent orchestration, ReAct workers, step-level tracing         |
| **MCP**       | Go, MCP go-sdk, replicate-go, GORM             | CLIP embeddings, description generation, similarity search tools           |
| **Storage**   | Postgres 18 + pgvector, S3-compatible, Redis   | Vector indexes, object storage, session cache                              |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Flutter    │────▶│   Hono API   │────▶│     Inngest     │
│   Client     │     │   (Bun)      │     │   Event Queue   │
│              │     │              │     │                 │
│ GenUI + Gemma│     │ Presigned S3 │     └────────┬────────┘
└─────────────┘     │ better-auth  │              │
                    └──────────────┘              ▼
┌─────────────┐                        ┌──────────────────┐
│    React     │                        │   Go Agents      │
│  Dashboard   │                        │                  │
│              │     ┌──────────┐       │ LangGraph loads  │
│  Workflow    │────▶│ Postgres │◀──────│ graph from DB,   │
│  Builder     │     │ pgvector │       │ executes nodes   │
└─────────────┘     └──────────┘       └────────┬─────────┘
                         ▲                      │
                         │               ┌──────▼─────────┐
                    ┌────┴───┐           │   MCP Server    │
                    │   S3   │           │                 │
                    │Storage │           │ CLIP embeddings │
                    └────────┘           │ Descriptions    │
                                         │ Similarity      │
                                         └─────────────────┘
```

**The pipeline:** Client captures image → API issues presigned S3 URL → Client uploads directly → API acknowledges and fires Inngest event → Go agent service loads the document's agent graph from Postgres → LangGraph builds and executes the workflow → Worker nodes call LLMs, tool nodes call MCP → MCP generates CLIP embeddings and descriptions → Everything lands in Postgres with HNSW cosine indexes → Searchable by meaning.

**Agent graphs are data, not code.** Templates define reusable workflows with nodes, edges, and tools. Instances bind templates to organizations. Three node types:

- **Worker** — ReAct agent with access to MCP tools
- **Tool** — Single MCP tool invocation with input/output mapping
- **Supervisor** — Multi-agent orchestration across workers

Every execution is traced step-by-step in `agent_graph_runs` and `agent_graph_run_steps` — state deltas, timing, errors, the full picture.

## Repository Layout

```
arcnem-vision/
├── client/                 Flutter app — GenUI, Gemma, camera, gallery
│   ├── lib/screens/        Auth, camera, dashboard, loading
│   ├── lib/services/       Upload, document, GenUI, intent parsing
│   └── lib/catalog/        Custom widget catalog for AI-generated UI
├── server/                 Bun workspace
│   ├── packages/api/       Hono routes, middleware, auth, S3, Inngest
│   ├── packages/db/        Drizzle schema (23 tables), migrations, seed
│   ├── packages/dashboard/ React admin — workflow builder, doc viewer
│   └── packages/shared/    Env helpers
├── models/                 Go workspace
│   ├── agents/             Inngest handlers, LangGraph execution engine
│   ├── mcp/                MCP server — 5 tools (embeddings, search)
│   ├── db/                 GORM gen introspection (schema → Go models)
│   └── shared/             Common env loading
└── docs/                   Deep dives — embeddings, LangChain, LangGraph, GenUI
```

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

```bash
cd server && bun i            # TypeScript dependencies
cd models && go work sync     # Go workspace
cd client && flutter pub get  # Flutter packages
```

### 2. Configure environment

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

You'll need:

- **S3-compatible storage config** — default local dev uses MinIO from `docker-compose.yaml`. Set the following in `server/packages/api/.env`, `server/packages/db/.env`, and `models/agents/.env`:
  - `S3_ACCESS_KEY_ID=minioadmin`
  - `S3_SECRET_ACCESS_KEY=minioadmin`
  - `S3_BUCKET=arcnem-vision`
  - `S3_ENDPOINT=http://localhost:9000`
  - `S3_REGION=us-east-1`
  - `S3_USE_PATH_STYLE=true` (agents only)
- **Or hosted S3-compatible bucket** — AWS S3, Cloudflare R2, Railway Object Storage, Backblaze B2, etc.
- **OpenAI API key** — `OPENAI_API_KEY` in `models/agents/.env`
- **Replicate token** — `REPLICATE_API_TOKEN` in `models/mcp/.env`
- **Database URL** — `postgres://postgres:postgres@localhost:5480/postgres` in the DB-related env files

### 3. Start infrastructure

```bash
docker compose up -d postgres redis minio minio-init
```

### 4. Migrate and seed

```bash
cd server/packages/db && bun run db:generate && bun run db:migrate && bun run db:seed
```

The seed prints a usable API key. For auto-auth in the Flutter app during development, set `DEBUG_SEED_API_KEY=...` in `client/.env`.

### 5. Run everything

**One command** (recommended):

```bash
tilt up
```

`tilt up` launches the full local stack and opens the Tilt dashboard UI (typically `http://localhost:10350`) where you can:

- Inspect live service logs
- Trigger manual resources like database seed
- Run optional maintenance flows like DB introspection

**Or manually** — run each in a separate terminal:

```bash
cd server/packages/api && bun run dev                    # API on :3000
cd server/packages/dashboard && bun run dev              # Dashboard on :3001
cd models/agents && go run .                             # Agents on :3020
cd models/mcp && go run .                                # MCP on :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest  # Job queue
cd client && flutter run -d chrome                       # Flutter client
```

### Health checks

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## API Example

```bash
# 1. Get a presigned upload URL
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'

# 2. Upload directly to S3 with the returned uploadUrl
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png

# 3. Acknowledge — triggers the full agent pipeline
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

After step 3, Inngest fires `document/process.upload`. The agent graph takes it from there — CLIP embedding, description generation, vector indexing. Done.

## Useful Commands

```bash
# Database
cd server/packages/db && bun run db:generate   # Generate migrations
cd server/packages/db && bun run db:migrate    # Apply migrations
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # Seed data

# Go model generation (after schema changes)
cd models/db && go run ./cmd/introspect

# Linting
cd server && bunx biome check packages         # TypeScript
cd client && flutter analyze                   # Dart
cd client && flutter test                      # Flutter tests
```

## Requirements

- Docker + Docker Compose
- Bun (server)
- Go 1.25+ (agents, MCP)
- CompileDaemon (Go hot reload for `tilt up`)
- Flutter SDK (client)
- Inngest CLI (`npx inngest-cli@latest`)
- S3-compatible object storage (local MinIO via Docker Compose, or hosted S3/R2/Railway/etc.)
- Tilt (recommended)

## Documentation

| Doc                                        | What's in it                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| [site/](site/)                             | Local docs site (Starlight) for onboarding and reference pages                     |
| [docs/README.md](docs/README.md)           | Deep-dive map and documentation maintenance guidance                               |
| [docs/embeddings.md](docs/embeddings.md)   | Current embedding implementation and operational constraints                       |
| [docs/langgraphgo.md](docs/langgraphgo.md) | Graph orchestration patterns, parallel execution, checkpointing, human-in-the-loop |
| [docs/langchaingo.md](docs/langchaingo.md) | LLM providers, chains, agents, tools, MCP bridging                                 |
| [docs/genui.md](docs/genui.md)             | Flutter GenUI SDK, DataModel binding, A2UI protocol, custom widgets                |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor workflow. If you use AI coding agents, also read [AGENTS.md](AGENTS.md).

---

<p align="center">
  Built by <a href="https://arcnem.ai">Arcnem AI</a> in Tokyo.
</p>
