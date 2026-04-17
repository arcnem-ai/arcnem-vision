# Arcnem Vision Dashboard

React dashboard for managing projects, workflow keys, service keys, workflows, uploaded documents, grounded Docs-tab chat, and live run inspection.

## What this package does

- **Projects & API Keys tab**: create projects, issue workflow keys bound to default workflows, and manage service keys for broader orchestration.
- **Workflow Library tab**: create/edit graph workflows with a visual canvas, browse reusable templates, generate draft graphs from a natural-language brief, and start a new workflow from any template.
- **Docs tab**: browse uploads, run semantic search, ask grounded questions across the current collection, upload directly from the dashboard, inspect related OCR and segmented outputs, and queue workflows against any document.
- **Runs tab**: inspect execution history and per-step state changes with realtime refresh.

The dashboard runs as a TanStack Start app and talks to the API server for data and mutations.

## Local development

The recommended way to run the dashboard is via `tilt up` from the repository root — it starts all services including the dashboard with hot reload. See the [root README](../../../README.md#quickstart) for details.

To run the dashboard standalone:

```bash
cd server && bun i
cd server/packages/dashboard
cp .env.example .env
bun run dev
```

Dev server runs on `http://localhost:3001`.

## Required environment variables

`server/packages/dashboard/.env.example`:

- `API_URL`: the server-side API base URL used by dashboard loaders, mutations, and the auth/chat/realtime proxies

Dashboard chat, realtime, auth, and AI workflow draft generation all proxy through the API server now. Keep `server/packages/api/.env` configured for `OPENAI_API_KEY`, `OPENAI_MODEL`, `MCP_SERVER_URL`, `REDIS_URL`, and `API_DEBUG`.

## Workflow editor notes

- Operators can click **Generate With AI** to describe a workflow and open an unsaved draft seeded from the live model and tool catalog.
- The Workflow Library exposes a searchable template picker. Operators can search by workflow name, node role, or tool, then clone a template into a new workflow canvas.
- Started workflows keep their source template provenance on `agent_graph_template_id` and `agent_graph_template_version_id`.
- Node types: `worker`, `supervisor`, `condition`, `tool`
- Worker/supervisor nodes require a model
- Workers can have multiple tools
- Tool nodes require exactly one tool and support input/output mapping
- Condition nodes require `true_target` / `false_target` routing and exactly two managed outgoing edges
- Graph validation enforces unique node keys, valid edges, valid supervisor membership, valid condition routing, and entry-to-`END` reachability

## Document operations notes

- Documents search is wired to `query` on `/api/dashboard/documents`
- Search blends lexical ranking with semantic description matches when `DOCUMENT_SEARCH_MODE=hybrid` and embeddings are available
- Search filters are pushed into the API/MCP scope so project, API key, and dashboard-upload filters rank within the requested slice
- Docs collection chat posts to the local `/api/documents/chat` proxy, which forwards to `/api/dashboard/documents/chat`
- The current chat launcher is organization-scoped and grounds answers in descriptions, OCR text, and related segmentation context
- Chat responses stream over Server-Sent Events and can attach source cards with project/API-key badges plus matched excerpts
- Dashboard uploads use `/api/dashboard/documents/uploads/presign` and `/api/dashboard/documents/uploads/ack`
- Related segmentation outputs are fetched from `/api/dashboard/documents/:id/segmentations`
- Selecting a document lets operators queue any saved workflow against it with `/api/dashboard/documents/:id/run`

## Realtime notes

- The dashboard subscribes to the local `/api/realtime/dashboard` proxy, which forwards to `/api/dashboard/realtime`
- Documents refresh on document creation, description updates, and segmentation creation
- Runs refresh on run creation, step changes, and run completion

## Build

```bash
bun run build
```

For local Docker smoke tests, copy `server/packages/dashboard/.env.docker.example` to `.env.docker`; `make` reads the `.env.docker` file.
