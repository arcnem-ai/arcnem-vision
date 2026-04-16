---
title: Architecture
description: How ingestion, workflow execution, MCP-backed analysis, and run tracking fit together.
---

Arcnem Vision is built around a server-side workflow engine for image analysis. Images enter through workflow API keys or the dashboard, workflows are loaded from database state, agents call MCP tools to analyze the image, and the dashboard exposes the resulting documents, artifacts, and run traces.

## System Diagram

```text
┌──────────────────────┐          ┌──────────────────────────┐
│ Workflow Key Client  │──x-api-key upload flow────────────▶│
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

## Two Ingestion Paths

### Workflow / API-key ingestion

Workflow API keys are scoped to an organization and project, and each one binds directly to a default workflow. A client or external integration:

1. calls `/api/uploads/presign`
2. uploads directly to S3-compatible storage
3. calls `/api/uploads/ack`

That acknowledgement verifies the uploaded object, creates the document record, and emits `document/process.upload`. The agents service then loads the workflow key's bound workflow and executes it.

### Dashboard ingestion

The dashboard provides a separate operator path:

1. upload an image into a selected project
2. create a document record without attaching it to an API key
3. queue any saved workflow against that document

This is useful for one-off review, experimentation, reruns, and comparing workflows against the same image.

## Workflows Are Database State

The workflow engine is defined in Postgres:

- `agent_graphs`: saved workflows
- `agent_graph_templates` and `agent_graph_template_versions`: reusable, versioned templates
- `agent_graph_nodes`: node definitions
- `agent_graph_node_tools`: tool assignments
- `agent_graph_edges`: explicit graph edges

The dashboard edits those records directly through the workflow canvas. The agents service loads a graph snapshot at runtime and builds a LangGraph state machine from it.

Four node types are supported:

- **worker**: LLM-driven specialist with model settings, prompts, and optional MCP tools
- **tool**: single MCP tool call with input/output mappings
- **supervisor**: LLM router that coordinates a set of worker members
- **condition**: deterministic branch using `contains` or `equals`

State reducers can also be defined in the graph schema so keys append or overwrite predictably during execution.

## MCP-Backed Analysis

The MCP service is the analysis layer behind both workflows and dashboard chat. The current server registers tools for:

- creating document descriptions
- creating image embeddings
- creating OCR results
- creating segmentations
- creating description embeddings
- finding similar documents
- finding similar descriptions
- searching documents in scope
- browsing documents in scope
- reading grounded document context

Those tools power the seeded showcase workflows:

- `Document Processing Pipeline`
- `Image Quality Review`
- `Document Segmentation Showcase`
- `Semantic Document Segmentation Showcase`
- `OCR Keyword Condition Router`
- `OCR Review Supervisor`

## Persistence Model

The system persists both source documents and derived artifacts:

- `documents`: uploaded and derived image files
- `document_descriptions`: saved textual descriptions
- `document_embeddings`: image embeddings
- `document_description_embeddings`: text embeddings
- `document_ocr_results`: OCR text plus metadata and raw result payloads
- `document_segmentations`: segmentation metadata plus links to derived segmented documents

This matters because the platform is not just "run a model and throw away the result." It builds a persistent corpus that can be searched, inspected, and reused in later workflows.

## Run Tracking And State Visibility

Every execution is tracked in:

- `agent_graph_runs`
- `agent_graph_run_steps`

The run tracker records:

- initial state
- final state
- per-step state deltas
- start and finish times
- errors

The dashboard subscribes to realtime events over Server-Sent Events so operators see document creation, OCR creation, description updates, segmentation creation, run creation, run step changes, and run completion as they happen.

## Retrieval And Grounded Chat

The dashboard's Docs tab sits on top of the persisted corpus:

- semantic search uses stored embeddings
- lexical fallback is available when no semantic seed exists
- grounded collection chat reads document descriptions, OCR text, and related segmentation context

Because the chat layer reads from stored artifacts rather than ephemeral agent state, it works as an operator-facing retrieval surface for the whole collection.

## Dashboard As Control Plane

The dashboard is the main operating surface for the platform:

- create projects and API keys
- issue or rotate API keys
- bind workflows to workflow keys
- build workflows and templates
- upload ad-hoc documents
- inspect OCR and segmentation outputs
- search and chat across the collection
- inspect live and historical runs

## Optional Client

The Flutter app is a useful demo client for camera capture, preview, and GenUI experiments. It is not required for the core platform story. The core value is in the server-side workflow engine, dashboard control plane, and persistent analysis pipeline.

## Repository Layout

```text
arcnem-vision/
├── server/                 Bun workspace
│   ├── packages/api/       Upload/auth routes, dashboard APIs, Inngest triggers
│   ├── packages/db/        Drizzle schema, migrations, templates, seed data
│   ├── packages/dashboard/ React operator UI
│   └── packages/shared/    Shared env helpers
├── models/                 Go workspace
│   ├── agents/             Graph loader, execution, run tracker
│   ├── mcp/                MCP tool server
│   ├── db/                 GORM model generation
│   └── shared/             Shared runtime utilities
├── client/                 Optional Flutter demo client
└── docs/                   Deep-dive notes
```

## Service Ports

| Service | Host Port | Container Port |
| --- | --- | --- |
| Postgres | 5480 | 5432 |
| Redis | 6381 | 6379 |
| API | 3000 | — |
| Dashboard | 3001 | — |
| Agents | 3020 | — |
| MCP | 3021 | — |
