# Changelog

Arcnem Vision follows [semantic versioning](https://semver.org/). Before 1.0, minor releases may include breaking changes, which are called out here.

## 0.2.1 (2026-10-01)

Accurate errors from upload acknowledgement and the dashboard workflow routes, and current dependencies, including the stable Effect 4.0 release.

### Upgrading from 0.2.0

- No configuration or migration changes.
- Service clients should retry an upload acknowledgement that returns 502. Storage failures used to return 404.

### Changed

- **Dependencies.** Effect 4.0.0 (previously a release candidate), Better Auth 1.7.7, TanStack AI 0.63, the MCP SDKs (TypeScript 2.2, Go 1.8), Hono 4.13.12, Inngest 4.21 and current Go modules. Runtimes and images: Bun 1.4.2, Go 1.27.1, Alpine 3.24 and Redis 8.10.2.
- **Railway template link.** The READMEs and the Deploy on Railway guide link to the published template, https://railway.com/deploy/arcnem-vision.

### Fixed

- **Upload acknowledgement reports storage and database failures accurately.** A storage outage or credential error returned 404 "Uploaded object not found"; it now returns 502 "Storage is unavailable. Please retry." A stalled storage call times out after 10 seconds instead of holding the request open. A database failure returned 409 and now returns 500. Only a concurrent acknowledgement replays the earlier result, so 400 and 413 rejections are no longer replayed. The service OpenAPI document lists the retryable failures.
- **Dashboard workflow errors carry the right status.** A missing or unshared template returns 404 instead of 500, and a template without a usable version returns 409. Workflow draft generation returns 502 for provider failures instead of 400, without passing provider error text to the browser.

## 0.2.0 (2026-09-29)

One-click deployment on Railway, and what a fresh deployment needs to run: a production bootstrap and agents that register with a self-hosted Inngest server.

### Upgrading from 0.1.0

- Set `AUTH_EMAIL_DELIVERY` on the API to `resend` or `log`. The API refuses to start without it.
- Set `INNGEST_SERVE_ORIGIN` on the agents to their own origin, as Inngest reaches them. Leave `INNGEST_DEV` unset in deployments; the agents refuse `0` and `false`.

### Added

- **Production bootstrap.** `bun run bootstrap` (API package) prepares a fresh deployment after migrations: the model and tool catalog, the first owner with an organization and default project, and a starter workflow. It is idempotent and safe to run from overlapping deploys. `bun run deploy:prepare` waits for the database, migrates, then bootstraps. The local seed now takes its catalog from the same module.
- **Deploy on Railway.** A Railway template runs the whole service in one project: the API, dashboard, agents and tools, Postgres with pgvector, Redis, and a self-hosted Inngest server. You bring an S3-compatible bucket and your OpenAI and Replicate keys. The first deploy creates the owner, organization and starter workflow. See the new Deploy on Railway guide.

### Changed

- **Sign-in code delivery (breaking).** `AUTH_EMAIL_DELIVERY` is required: `resend` emails codes, `log` writes them to the API log. Codes are no longer logged just because `API_DEBUG` is on.

### Fixed

- **Agents register with a self-hosted Inngest server (configuration).** A self-hosted server syncs an app by asking it to post its functions back, but the Go SDK replies with them inline, so the agents never registered and uploads were never processed. The agents now register themselves when they start and retry until Inngest accepts them. Set `INNGEST_SERVE_ORIGIN` on the agents to their own origin, the address Inngest uses to reach them.

## 0.1.0 (2026-09-29)

The first tagged release. It covers the core service: image ingestion, configurable agent workflows, the operator dashboard, and the ways other systems connect to them.

### Included

- **Ingestion.** Workflow keys upload through presign, a direct upload to storage, and acknowledgement, which queues the key's bound workflow. Dashboard operators can upload images and choose any workflow. Service keys have their own project-scoped upload, execution, search and publication API with idempotency keys, described by `GET /api/openapi.json`.
- **Workflows.** Graphs are stored in Postgres and made of worker, tool, supervisor and condition nodes, with templates, versions and AI-assisted drafting. Accepted executions run a pinned snapshot of the graph. Every run and step is recorded in `agent_graph_runs` and `agent_graph_run_steps`.
- **Analysis tools.** Internal MCP tools cover OCR, descriptions, image and description embeddings, prompt-based and semantic segmentation, similarity search, scoped search and browse, and grounded document reads. Each tool call is authorized against the run's own project and documents.
- **Signed webhooks.** Service keys can register endpoints for `workflow.completed` and `workflow.failed`. Deliveries follow Standard Webhooks, are queued in the same transaction as the run's final state, get up to three Inngest retries, and can be resent from the API, the dashboard or MCP.
- **OAuth MCP.** External agents can connect to `/api/mcp` with OAuth (PKCE and CIMD). Separate scopes cover reading, editing, running workflows and managing webhooks.

### Changes during release preparation

- `GET /api/documents/:id/similar` returns only the calling workflow key's own documents. It used to match across the whole organization.
- **Configuration (breaking).**
  - `AUTH_ENABLE_SIGN_UP` and `AUTH_ENABLE_ORGANIZATION_CREATION` are required and must be `true` or `false`.
  - `API_DEBUG` and the new `WEBHOOK_ALLOW_PRIVATE_DESTINATIONS` are local-only. The API refuses to start with either enabled unless `BETTER_AUTH_BASE_URL` is a local `http://` URL.
  - `JOB_SERVER_URL` is renamed `INNGEST_SERVE_ORIGIN` and is required.
  - `CLIENT_ORIGIN` is removed.
  - The Go services no longer read `MCP_SERVER_NAME`, `MCP_SERVER_VERSION`, `MCP_CLIENT_NAME` or `MCP_CLIENT_VERSION`.
- **Request and upload limits.** API request bodies are limited to 1 MiB. Workflow input that would make the Inngest event larger than 255 KiB is rejected with `413` before a run is created. Uploads larger than 10 MiB are rejected at acknowledgement, and the stored object is deleted.
- **Repeatable acknowledgement.** A workflow-key acknowledgement can be repeated safely. When the first enqueue failed, repeating it retries processing, and an upload is never queued twice.
- **Dashboard.** Closing a tab now closes the API realtime and chat streams behind it. Only content-hashed assets are cached as immutable.
- **Database.** Enum-style CHECK constraints are dropped (migration `0015`). `presigned_uploads.processing_queued_at` is added (migration `0016`).
- **CI.** CI runs lint, type checks, the database- and Redis-backed tests, the dashboard build and every Docker image.
- **Quickstart.** `OPENAI_API_KEY` belongs in `models/mcp/.env` too; semantic search runs in the MCP service.

### Known limitations

- **Roles.** Every member of an organization can manage its projects, API keys and webhooks. There is no owner/admin/member distinction yet.
- **Uploads.** A presigned upload URL stays valid for 5 minutes. During that window the uploader can overwrite an object that has already been acknowledged. The Go services cap and downscale what they read. Presigned uploads that are never acknowledged are not cleaned up.
- **Webhooks.** They are sent only for executions started through the service API or MCP. Upload processing and dashboard runs don't emit them. Delivery history is kept indefinitely.
- **Model providers.** OpenAI (Responses API) and Replicate are the supported providers.
