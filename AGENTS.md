# Repository Guidelines

This file is written for AI coding agents. Human contributors should start with `README.md` and `CONTRIBUTING.md`.

## Project Structure & Module Organization
- `client/` contains the Flutter app. Main code lives in `client/lib/` (screens, providers, services, models, enums, catalog, theme); widget tests live in `client/test/`.
- `server/` is a Bun workspace with four packages:
  - `server/packages/api/src/` hosts Hono routes/middleware (auth, uploads, documents, dashboard).
  - `server/packages/db/src/` defines Drizzle schema/migrations. Schema is split into `authSchema.ts`, `projectSchema.ts`, and `agentGraphSchemas.ts` with relationships in `relationships.ts`.
  - `server/packages/dashboard/` is a React admin UI built with TanStack Router, Tailwind, and shadcn/ui.
  - `server/packages/shared/src/` holds shared env helpers (`createEnvVarGetter` pattern).
- `models/` is a Go workspace (`go.work`) with modules:
  - `models/agents/` — Gin server with Inngest job handlers and LangGraph workflow execution. Organized by feature: `clients/`, `jobs/`, `graphs/`, `load/`, `tools/`, `server/`, `enums/`, `utils/`.
  - `models/mcp/` — MCP server with 5 registered tools (CLIP embeddings, descriptions, similarity search). Organized: `server/`, `tools/`, `clients/`.
  - `models/db/` — GORM gen introspection tool (`cmd/introspect/`) with generated models in `gen/models/` and queries in `gen/queries/`.
  - `models/cli/` — Bubble Tea TUI (stub).
  - `models/shared/` — Common env loading via godotenv.
- Local infra and orchestration are defined in `docker-compose.yaml` and `Tiltfile`.

## Build, Test, and Development Commands
- Requirements for local dev:
  - Docker + Docker Compose
  - Bun (server workspace)
  - Go 1.25+ (agents, MCP, model introspection)
  - Flutter SDK (client)
  - Tilt (recommended)
  - Inngest CLI (`npx inngest-cli@latest`)
  - CompileDaemon (`go install github.com/githubnemo/CompileDaemon@latest`)
  - Hosted S3-compatible bucket (S3 / R2 / Railway / etc.)
- `docker compose up -d postgres redis`: start local dependencies.
- `tilt up`: run full stack (deps, DB generation/migration, API, dashboard, Go services, Flutter web).
- Tilt UI is typically available at `http://localhost:10350` (logs + manual resources like seed/introspection).
- `cd client && flutter pub get && flutter run -d chrome`: run Flutter client.
- `cd client && flutter analyze`: run Dart static analysis.
- `cd server && bun i`: install server workspace dependencies.
- `cd server/packages/api && bun run dev`: start API server (port 3000).
- `cd server/packages/dashboard && bun run dev`: start dashboard UI on port 3001.
- `cd server/packages/db && bun run db:generate && bun run db:migrate`: generate/apply DB migrations.
- `cd server/packages/db && bun run db:seed`: seed local database.
- `cd models/agents && CompileDaemon -build="go build -o tmp/main ." -command="./tmp/main"` / `cd models/mcp && CompileDaemon -build="go build -o tmp/main ." -command="./tmp/main"`: run Go services with hot compile.
- `cd models/db && go run ./cmd/introspect`: regenerate GORM models from DB schema.
- `npx inngest-cli@latest dev -u http://localhost:3020/api/inngest`: run Inngest locally.

## Infrastructure Defaults

| Service   | Host Port | Container Port |
|-----------|-----------|----------------|
| Postgres  | 5480      | 5432           |
| Redis     | 6381      | 6379           |
| API       | 3000      | —              |
| Dashboard | 3001      | —              |
| Agents    | 3020      | —              |
| MCP       | 3021      | —              |

## Environment

Each service has its own `.env` (copy from `.env.example`):
- `server/packages/api/.env` — S3, Inngest, better-auth secrets, Redis
- `server/packages/db/.env` — DATABASE_URL
- `client/.env` — API_URL, CLIENT_ORIGIN, DEBUG_SEED_API_KEY
- `models/agents/.env` — DATABASE_URL, S3, OPENAI_API_KEY, MCP_SERVER_URL, Inngest
- `models/mcp/.env` — REPLICATE_API_TOKEN, DATABASE_URL, MCP server name/version
- `models/db/.env` — DATABASE_URL

## Coding Style & Naming Conventions
- TypeScript uses Biome (`server/biome.json`): tabs, double quotes, import organization. Run `cd server && bunx biome check packages`.
- Dart follows `flutter_lints` (`client/analysis_options.yaml`); use `UpperCamelCase` for classes/widgets and `lowerCamelCase` for fields/methods. Error handling uses `fpdart` Either/TaskEither pattern.
- Go should be formatted with `gofmt`; keep package names lowercase and organize by feature (`clients/`, `jobs/`, `graphs/`, `server/`, `tools/`).

## Testing Guidelines
- Current automated tests are minimal (existing example: `client/test/widget_test.dart`).
- For client changes, run `cd client && flutter test`.
- For new TS/Go features, add colocated tests (`*.test.ts`, `*_test.go`) and run the relevant module test command before opening a PR.

## Commit & Pull Request Guidelines
- Follow the existing commit style: short, imperative subjects (examples from history: `Upload ack`, `Align drizzle version`, `gemma gen ui`).
- Keep commits focused on one concern.
- PRs should include: purpose, impacted areas (`client`, `server`, `models`), setup/migration steps, and screenshots for UI changes.
- Link related issues and call out new env vars, ports, or infrastructure changes.

## Security & Configuration Tips
- Copy each module's `.env.example` to `.env`; do not commit secrets.
- Keep local defaults aligned unless intentionally changing shared config (Postgres `5480`, Redis `6381`, API `3000`, Dashboard `3001`, Agents `3020`, MCP `3021`).
- API keys are stored as SHA-256 hashes; never log or expose raw keys.
