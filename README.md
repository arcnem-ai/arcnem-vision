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

Arcnem Vision is an open-source image ingestion and orchestration platform. Devices can upload images with org/project/device-scoped API keys, operators can upload images from the dashboard, and every document can be routed through a customizable agent graph stored in Postgres and executed by Go services.

That core service is the product: a control plane for defining workflows, attaching them to devices, running ad-hoc analyses from the dashboard, persisting OCR/descriptions/embeddings/segmentations, and inspecting every run with step-level state transitions. The Flutter app is included as a demo client for capture and GenUI experiments, but it is not the center of the system.

## Core Service

- **Two ingestion paths**: device/API-key uploads for automated pipelines, plus dashboard uploads for ad-hoc operator review.
- **Configurable workflows**: graphs live in the database and can be created, edited, templated, cloned, and assigned without redeploying code.
- **Multiple analysis modes**: OCR, descriptions, image embeddings, description embeddings, prompt-based segmentation, semantic segmentation, similarity search, and grounded collection chat.
- **Mixed orchestration styles**: combine LLM workers, MCP tool nodes, supervisor routing, and deterministic condition nodes in the same graph.
- **Persistent run history**: track `agent_graph_runs` and `agent_graph_run_steps` with initial state, final state, per-step deltas, timing, and errors.
- **Operator-first dashboard**: manage projects, devices, API keys, workflow templates, uploads, search, chat, and live run inspection from one UI.

## What You Can Customize

- **Worker nodes**: choose a model, prompt, input mode, and optional MCP tools.
- **Tool nodes**: call one MCP tool with configurable input/output mappings and literal constants.
- **Supervisor nodes**: route between specialist workers, cap iterations, and choose explicit finish targets.
- **Condition nodes**: branch on extracted state with `contains` or `equals` rules.
- **State reducers**: configure append vs overwrite behavior per state key.
- **Template library**: save reusable workflow versions, then start editable copies from them in the dashboard.

## Analysis Modes

The seeded workflows show the kinds of pipelines this service is built for:

- **Document Processing Pipeline**: describe an image, save the description, embed the image and text, then find similar items.
- **Image Quality Review**: use a supervisor to route an upload to a good-image or bad-image specialist.
- **Document Segmentation Showcase**: derive a prompt from the image, run prompt-based segmentation, then summarize the segmented output.
- **Semantic Document Segmentation Showcase**: run semantic segmentation directly and describe the result.
- **OCR Keyword Condition Router**: extract OCR, branch deterministically on keywords, and save a summary.
- **OCR Review Supervisor**: extract OCR with confidence, route to domain specialists, and save a reviewed summary.

Behind those workflows, the MCP layer currently exposes document description, document embedding, OCR, segmentation, description embedding, similarity search, scoped search, scoped browse, and grounded document-context reads.

## Tech Stack

| Layer | Tech | What it does |
| --- | --- | --- |
| **API** | Bun, Hono, better-auth, Inngest, Pino | Presigned upload flow, auth, orchestration triggers, realtime publishing |
| **Dashboard** | React 19, TanStack Router, Tailwind, shadcn/ui | Projects/devices/API keys, workflow builder, docs view, chat, run inspection |
| **Agents** | Go, Gin, LangGraph, LangChain, inngestgo | Loads graph snapshots from DB, executes worker/tool/supervisor/condition nodes |
| **MCP** | Go, MCP go-sdk, replicate-go, GORM | OCR, descriptions, embeddings, segmentation, retrieval, grounded reads |
| **Storage** | Postgres 18 + pgvector, S3-compatible storage, Redis | Documents, derived artifacts, vector indexes, sessions, realtime fan-out |
| **Client** | Flutter, Dart, flutter_gemma, GenUI | Optional demo client for capture, preview, and UI experiments |

## Architecture

```text
┌──────────────────────┐          ┌──────────────────────────┐
│ Device / Integration │──x-api-key upload flow────────────▶│
└──────────────────────┘          │        Hono API          │
                                  │   presign / ack / auth   │
┌──────────────────────┐          │                          │
│ Dashboard Operators  │──session-based uploads / queue────▶│
└──────────┬───────────┘          └─────────────┬────────────┘
           │                                    │
           │ search, chat, runs, config         │ enqueue
           ▼                                    ▼
     ┌──────────────┐                    ┌──────────────┐
     │  Dashboard   │◀──realtime SSE────▶│    Inngest    │
     │  Control UI  │                    └──────┬───────┘
     └──────┬───────┘                           │
            │                                    ▼
            │                            ┌──────────────┐
            └──────────────▶ Postgres ◀──│  Go Agents    │
                           + pgvector    │  LangGraph    │
                                         └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  MCP Server   │
                                         │ OCR / desc /  │
                                         │ embed / seg / │
                                         │ retrieval     │
                                         └──────────────┘
```

**Device flow**: a device or external integration calls `/api/uploads/presign`, uploads to S3, then calls `/api/uploads/ack`. The API verifies the object, creates the document, and emits `document/process.upload`. The agents service then loads the document's assigned workflow from the database and runs it.

**Dashboard flow**: an operator uploads an image to a project from the Docs tab. The dashboard path creates the document without binding it to a device, and the operator can then queue any saved workflow against that document from the UI.

**Execution flow**: the agents service builds the graph from DB rows, runs LangGraph nodes, calls MCP tools as needed, and persists run records, step deltas, errors, OCR results, descriptions, embeddings, and segmentations back into Postgres.

## Screenshots

| Projects & Devices | Workflow Library |
|---|---|
| ![Dashboard Projects](site/public/dashboard-projects.png) | ![Workflow Library](site/public/dashboard-workflows.png) |

| Docs Search & Chat | Run Details |
|---|---|
| ![Docs Search and Chat](site/public/dashboard-docs-chat.png) | ![Agent Run Details](site/public/dashboard-run-detail.png) |

| Selected Document & Derived Outputs | Optional Demo Client |
|---|---|
| ![Selected Document and Segmentation](site/public/dashboard-docs-segmentation-detail.png) | ![Flutter Client](site/public/flutter-client.png) |

## Quickstart

### 1. Clone and configure

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

Copy every `.env.example` to `.env`:

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp server/packages/dashboard/.env.example server/packages/dashboard/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

Add your provider keys:

- **[OpenAI API key](https://platform.openai.com/api-keys)** → `OPENAI_API_KEY` in `models/agents/.env`
- **Same OpenAI key (recommended)** → `OPENAI_API_KEY` in `server/packages/api/.env` for dashboard collection chat
- **[Replicate API token](https://replicate.com/account/api-tokens)** → `REPLICATE_API_TOKEN` in `models/mcp/.env`

Everything else is wired for local development. Postgres, Redis, and MinIO come from `docker-compose.yaml`.

### 2. Start the stack

```bash
tilt up
```

Tilt starts the whole repository, including the dashboard, API, agents, MCP server, Inngest, docs site, and the Flutter demo client. If you're evaluating the core service, your first stop should be the dashboard on `http://localhost:3001`.

### 3. Seed the database

In the Tilt UI, trigger **seed-database**.

The seed creates:

- a demo organization, project, devices, and API keys
- reusable workflow templates and editable workflows
- sample documents for the document, OCR, quality-review, and segmentation paths
- example OCR results, descriptions, embeddings, segmentations, and run history
- a local debug dashboard session

Because `server/packages/api/.env.example` enables `API_DEBUG=true`, the dashboard can auto-bootstrap into the seeded local session after seeding.

### 4. Explore the core service

1. Open `http://localhost:3001`.
2. In **Projects & Devices**, inspect seeded devices and their attached workflows.
3. In **Workflow Library**, browse templates and open the canvas to see how graphs are composed.
4. In **Docs**, inspect seeded documents or upload a new one from the dashboard.
5. In **Runs**, expand a run to inspect initial state, per-step deltas, final state, and errors.

### 5. Test automated device ingestion

Use a device API key to exercise the automated path:

```bash
# 1. Ask the API for a presigned upload URL
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'

# 2. Upload directly to storage
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png

# 3. Acknowledge the upload
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

For device-bound uploads, step 3 verifies the object, creates the document, and enqueues `document/process.upload` for the device's assigned workflow.

## Requirements

- Docker + Docker Compose
- Bun
- Go 1.25+
- CompileDaemon (`go install github.com/githubnemo/CompileDaemon@latest`)
- Flutter SDK
- Tilt

## Repository Layout

```text
arcnem-vision/
├── server/                 Bun workspace
│   ├── packages/api/       Upload/auth routes, dashboard APIs, Inngest triggers
│   ├── packages/db/        Drizzle schema, migrations, seed data, templates
│   ├── packages/dashboard/ React control plane for operators
│   └── packages/shared/    Shared env helpers
├── models/                 Go workspace
│   ├── agents/             Workflow loader, LangGraph execution, run tracker
│   ├── mcp/                OCR, embeddings, descriptions, segmentation, retrieval
│   ├── db/                 GORM model generation
│   └── shared/             Shared env, S3, realtime utilities
├── client/                 Optional Flutter demo client
└── docs/                   Deep dives on embeddings, LangChain, LangGraph, GenUI
```

## Documentation

| Doc | What's in it |
| --- | --- |
| [site/](site/) | Docs site for onboarding, architecture, guides, and API examples |
| [site/src/content/docs/architecture.md](site/src/content/docs/architecture.md) | Service architecture, ingestion paths, workflow model, persistence |
| [site/src/content/docs/guides/dashboard-workflow-editor.md](site/src/content/docs/guides/dashboard-workflow-editor.md) | Dashboard operations, workflow canvas, docs tab, runs tab |
| [site/src/content/docs/reference/api.md](site/src/content/docs/reference/api.md) | Device ingestion, dashboard uploads, run queueing, realtime feed |
| [docs/embeddings.md](docs/embeddings.md) | Embedding implementation details |
| [docs/langgraphgo.md](docs/langgraphgo.md) | LangGraph orchestration patterns and graph execution notes |
| [docs/langchaingo.md](docs/langchaingo.md) | LangChain and tool-integration notes |
| [docs/genui.md](docs/genui.md) | Flutter GenUI experiments and widget protocol details |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor workflow. If you use AI coding agents, also read [AGENTS.md](AGENTS.md).

---

<p align="center">
  Built by <a href="https://arcnem.ai">Arcnem AI</a> in Tokyo.
</p>
