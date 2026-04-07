# Arcnem Vision Dashboard

React dashboard for managing projects, devices, API keys, workflows, uploaded documents, grounded Docs-tab chat, and live run inspection.

## What this package does

- **Projects & Devices tab**: create projects, register devices, assign default workflows, and issue or rotate device API keys.
- **Workflow Library tab**: create/edit graph workflows with a visual canvas, browse reusable templates, and start a new workflow from any template.
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

- `API_URL`: API base URL (default local value: `http://localhost:3000`)
- `DATABASE_URL`: local Postgres connection string
- `DASHBOARD_SESSION_TOKEN`: optional local debug session token
- `OPENAI_API_KEY`: required for Docs-tab collection chat
- `OPENAI_MODEL`: optional model override for Docs-tab collection chat (defaults to `gpt-4.1-mini`)
- `MCP_SERVER_URL`: MCP endpoint used to ground Docs-tab chat answers
- `REDIS_URL`: Redis connection string for realtime dashboard updates

## Workflow editor notes

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
- If a matching description is found, the API returns nearest semantic matches using embedding distance
- If no semantic seed is found, the API falls back to lexical `ILIKE` matching
- Docs collection chat posts to `/api/documents/chat`
- The current chat launcher is organization-scoped and grounds answers in descriptions, OCR text, and related segmentation context
- Chat responses stream over Server-Sent Events and can attach source cards with project/device badges plus matched excerpts
- Dashboard uploads use `/api/dashboard/documents/uploads/presign` and `/api/dashboard/documents/uploads/ack`
- Related segmentation outputs are fetched from `/api/dashboard/documents/:id/segmentations`
- Selecting a document lets operators queue any saved workflow against it with `/api/dashboard/documents/:id/run`

## Realtime notes

- The dashboard subscribes to `/api/realtime/dashboard` with Server-Sent Events
- Documents refresh on document creation, description updates, and segmentation creation
- Runs refresh on run creation, step changes, and run completion

## Build

```bash
bun run build
```
