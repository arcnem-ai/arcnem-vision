# Arcnem Vision Dashboard

React dashboard for managing projects, devices, agent workflows, and uploaded documents.

## What this package does

- **Projects & Devices tab**: assign workflows to devices.
- **Workflow Library tab**: create/edit graph workflows with a visual canvas.
- **Documents tab**: browse uploads and run semantic search over embedded descriptions.

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
- `REDIS_URL`: Redis connection string for realtime dashboard updates

## Workflow editor notes

- Node types: `worker`, `supervisor`, `tool`
- Worker/supervisor nodes require a model
- Workers can have multiple tools
- Tool nodes require exactly one tool and support input/output mapping
- Graph validation enforces unique node keys, valid edges, and entry-to-`END` reachability

## Semantic search notes

- Documents search is wired to `query` on `/api/dashboard/documents`
- If a matching description is found, the API returns nearest semantic matches using embedding distance
- If no semantic seed is found, the API falls back to lexical `ILIKE` matching

## Build

```bash
bun run build
```
