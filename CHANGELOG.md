# Changelog

Arcnem Vision follows [semantic versioning](https://semver.org/). Before 1.0, minor releases may include breaking changes, which are called out here.

## 0.1.0 (unreleased)

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

### Known limitations

- **Roles.** Every member of an organization can manage its projects, API keys and webhooks. There is no owner/admin/member distinction yet.
- **Uploads.** A presigned upload URL stays valid for 5 minutes. During that window the uploader can overwrite an object that has already been acknowledged. The Go services cap and downscale what they read. Presigned uploads that are never acknowledged are not cleaned up.
- **Webhooks.** They are sent only for executions started through the service API or MCP. Upload processing and dashboard runs don't emit them. Delivery history is kept indefinitely.
- **Model providers.** OpenAI (Responses API) and Replicate are the supported providers.
