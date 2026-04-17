---
title: Getting Started
description: Run the core services locally and exercise image workflows from the dashboard or workflow API keys.
---

:::tip[Start with the core service]
Arcnem Vision ships a Flutter demo client, but the fastest way to understand the product is through the dashboard and upload API. The core loop is: ingest an image, run a workflow, inspect the results, and review the run trace.
:::

## Prerequisites

- Docker + Docker Compose
- Bun
- Go 1.25+ (agents, MCP)
- CompileDaemon (`go install github.com/githubnemo/CompileDaemon@latest`)
- Flutter SDK
- Tilt

`tilt up` launches the Flutter demo client too, so the Flutter SDK is still part of the default local stack. If you are evaluating the platform, focus on the dashboard and server-side services first.

## 1. Clone and configure

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
- **Same OpenAI key (recommended)** → `OPENAI_API_KEY` in `server/packages/api/.env` for dashboard collection chat and AI workflow draft generation
- **[Replicate API token](https://replicate.com/account/api-tokens)** → `REPLICATE_API_TOKEN` in `models/mcp/.env`

Everything else is already configured for local development. Postgres, Redis, and MinIO come from `docker-compose.yaml`.

## 2. Start everything

```bash
tilt up
```

Tilt installs dependencies, starts infrastructure, runs migrations, and launches the API, dashboard, agents, MCP server, Inngest, docs site, and the Flutter demo client. Open the Tilt UI at `http://localhost:10350` for logs and manual resources like seed and introspection.

## 3. Seed the database

In the Tilt UI, trigger **seed-database**.

The seed creates:

- a demo organization, project, workflow keys, service keys, and API keys
- editable workflows and reusable workflow templates
- sample images for the description, OCR, quality-review, and segmentation paths
- stored OCR results, descriptions, embeddings, segmentations, and example run history
- a local debug dashboard session

Because `server/packages/api/.env.example` enables `API_DEBUG=true`, the dashboard can bootstrap into the seeded local session after seeding.

## 4. Walk the core product

1. Open the dashboard at `http://localhost:3001`.
2. In **Projects & API Keys**, inspect seeded workflow keys, service keys, and their attached workflows.
3. In **Workflow Library**, browse templates, click **Generate With AI**, or open a graph in the canvas.
4. In **Docs**, inspect seeded documents or upload a new one from the dashboard.
5. In **Runs**, open a run and inspect its initial state, per-step deltas, final state, timing, and errors.

## 5. Exercise the two ingestion paths

### Workflow / API-key path

Use a workflow API key to run the automated flow:

```bash
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'
```

Then upload to the returned S3 URL and call `/api/uploads/ack`. That acknowledgement verifies the object, creates the document, and queues `document/process.upload` for the workflow key's bound workflow.

### Dashboard path

In the **Docs** tab:

1. Click **Add From Dashboard**.
2. Upload an image into a project.
3. Open the saved document.
4. Queue any saved workflow against it.

This path is useful for ad-hoc analysis, reruns, and operator-driven evaluation because the document is not tied to a workflow key by default.

## Health checks

```text
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## S3 config details

Default local dev uses MinIO from `docker-compose.yaml`. The `.env.example` files ship with working defaults:

- `S3_ACCESS_KEY_ID=minioadmin`
- `S3_SECRET_ACCESS_KEY=minioadmin`
- `S3_BUCKET=arcnem-vision`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_REGION=us-east-1`
- `S3_USE_PATH_STYLE=true`

For hosted storage, substitute your AWS S3, Cloudflare R2, Railway Object Storage, or Backblaze B2 credentials.

- Set `S3_USE_PATH_STYLE` explicitly for your provider.
- Cloudflare R2 commonly needs `S3_REGION=auto` and `S3_USE_PATH_STYLE=false`.
- When the dashboard uploads directly from the browser to storage, some providers such as R2 also need bucket CORS configured to allow your dashboard origin and `PUT` requests.
