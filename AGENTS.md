# Repository Guidelines

This is the canonical guidance for coding agents. `CLAUDE.md` points here. Human contributors should start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Product and architecture

The API, configurable agent graphs, and operator dashboard are the core service. `client/` is the optional Flutter capture and GenUI demo.

- `server/packages/api/src/`: Hono routes and middleware for authentication, uploads, documents, service execution, dashboard operations, and realtime events.
- `server/packages/dashboard/`: React/TanStack Start dashboard. Keep domain logic in the API; the dashboard proxies auth, chat, and realtime and renders API-owned state.
- `server/packages/db/src/schema/`: canonical Drizzle schema (`authSchema.ts`, `projectSchema.ts`, `agentGraphSchemas.ts`, and `relationships.ts`). Migrations live in `server/packages/db/src/migrations/`.
- `server/packages/shared/src/`: shared contracts, authorization helpers, workflow normalization, and environment access through `createEnvVarGetter`.
- `models/agents/`: Gin/Inngest handlers, graph loading, LangGraph execution, and run tracking.
- `models/mcp/`: internal Go MCP tools for OCR, descriptions, embeddings, segmentation, scoped search/browse, and grounded document reads.
- `models/db/`: GORM introspection in `cmd/introspect/`; generated models and queries in `gen/`.
- `models/shared/`: shared Go environment, storage, and realtime helpers. `models/go.work` lists the Go modules.
- `site/`: documentation site. `docker-compose.yaml`, `Tiltfile`, and `Makefile` define local orchestration.

Workflow-key ingestion follows presign, upload to S3, and acknowledgement. The API verifies the object and emits an Inngest event; Go agents load the graph, invoke workers/tools, and persist results and run history. Dashboard operators can upload documents and select workflows independently. The service API provides scoped uploads, explicit execution, status, search, and publication.

Graphs use template/version and instance records. Worker, tool, supervisor, and condition nodes have distinct model/tool/routing requirements. Preserve graph validation and provenance; execution history lives in `agent_graph_runs` and `agent_graph_run_steps`.

## Authorization and data

- Better Auth provides dashboard sessions and API keys. Workflow keys bind to one graph; service keys remain project-scoped orchestration credentials. Preserve organization/project checks in shared domain operations.
- API keys are stored as SHA-256 hashes. Never log raw keys, session tokens, provider credentials, or signed URLs.
- Drizzle owns schema changes; regenerate Go database bindings after applying a migration to the intended local database. Do not hand-edit generated bindings.
- Use UUIDv7 for new primary keys. Keep embedding dimensions consistent with model metadata and vector indexes; current CLIP embeddings use 768 dimensions with HNSW cosine indexes.
- Keep application-domain values such as `kind`, `status`, and `visibility` as text in the database and validate allowed values in application code, not enum-style database check constraints.
- Seeds are for disposable local data. Do not run seeds or destructive test setup against a shared or production database.

## Development

Use the Bun version pinned in `server/package.json` and the Go version in `models/go.work`. Docker/Compose, Tilt, and CompileDaemon support the full stack; Flutter is needed when running the demo client. Copy each service's `.env.example` to `.env`, or `.env.docker.example` to `.env.docker` for Makefile Docker workflows. Local Compose provides Postgres, Redis, and MinIO; hosted S3-compatible storage is also supported.

| Task | Command from repository root |
| --- | --- |
| Full stack | `tilt up` |
| Local infrastructure | `docker compose up -d postgres redis minio minio-init` |
| Install server dependencies | `cd server && bun install --frozen-lockfile` |
| API | `cd server/packages/api && bun run dev` |
| Dashboard | `cd server/packages/dashboard && bun run dev` |
| Dashboard build | `cd server/packages/dashboard && bun run build` |
| Generate migrations | `cd server/packages/db && bun run db:generate` |
| Apply migrations | `cd server/packages/db && bun run db:migrate` |
| Seed disposable local data | `cd server/packages/db && bun run db:seed` |
| Regenerate Go bindings | `cd models/db && go run ./cmd/introspect` |
| Go services individually | `cd models/agents && go run .` or `cd models/mcp && go run .` |
| Flutter demo | `cd client && flutter pub get && flutter run -d chrome` |

Default host ports are Postgres `5480`, Redis `6381`, MinIO `9000`/`9001`, API `3000`, dashboard `3001`, agents `3020`, and MCP `3021`. Tilt's UI is normally on `10350`. Keep examples and callers aligned when changing these defaults.

Each API, dashboard, database, agents, MCP, introspection, and Flutter service reads its own environment file. Use one canonical variable per setting; do not add alias fallbacks or silently default critical configuration. The dashboard's server-side API URL and the API's storage, auth, Redis, model, and MCP settings are separate concerns.

## Style and verification

- TypeScript uses `server/biome.json`: tabs, double quotes, and organized imports. Run `cd server && bunx biome check packages`.
- Prefer canonical Tailwind utilities, including v4 variable syntax such as `text-(--ink)`.
- Go uses `gofmt`, lowercase package names, and feature-oriented packages.
- Dart uses `flutter_lints`, UpperCamelCase types, lowerCamelCase members, and the existing `fpdart` error-handling pattern.
- Run `cd server && bun test` for deterministic TypeScript tests, including service contracts, authorization, and OpenAPI generation. Run `go test ./...` in each affected Go module; CI covers agents, db, MCP, and shared.
- For Flutter changes, run `cd client && flutter analyze && flutter test`. For dashboard changes, also build the dashboard.
- Add focused colocated tests (`*.test.ts`, `*_test.go`) for changed behavior. Keep external providers and live infrastructure out of the default suite.
- `make live-service-test` runs the fuller upload/acknowledge/execute/publish probe. It uses the existing `.env.docker` files but starts isolated Postgres/Redis/MinIO and dedicated service containers. Use it when changing that lifecycle; `make live-service-stack-down` removes only that isolated stack and its volumes.

## Changes and review

Keep changes and commits focused, with short imperative subjects. Preserve unrelated work and never commit environment files or secrets. PR descriptions should explain behavior, validation, affected services, and any migration/configuration changes; include screenshots for UI changes. Verify current commands and paths before adding guidance rather than duplicating setup documentation here.
