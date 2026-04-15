---
title: API Examples
description: Device ingestion, service orchestration, dashboard uploads, workflow queueing, and realtime feed examples.
---

Arcnem Vision exposes three primary operational APIs:

- a **device/API-key ingestion path** for automated uploads
- a **service/API-key orchestration path** for project-scoped non-device clients
- a **dashboard/session path** for operator-driven uploads, browsing, and workflow queueing

## Device Ingestion

This is the automated path used by devices or external integrations.

### 1. Get a presigned upload URL

```bash
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'
```

### 2. Upload directly to storage

```bash
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png
```

### 3. Acknowledge the upload

```bash
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

After step 3, the API verifies the object, creates the document, and emits `document/process.upload`. The agents service loads the device's assigned workflow and executes it.

## Service API

The service API is the face-neutral orchestration surface for server-side clients.

### Discover workflows

```http
GET /api/service/workflows
```

### Create a presigned upload

```http
POST /api/service/uploads/presign
```

Body:

```json
{
  "contentType": "image/png",
  "size": 12345,
  "visibility": "private"
}
```

Visibility is declared at presign time. `ack` simply confirms the uploaded object and materializes the document.

### Acknowledge the upload

```http
POST /api/service/uploads/ack
```

Body:

```json
{
  "objectKey": "uploads/.../service-api/.../image.png"
}
```

### Queue a workflow execution

```http
POST /api/service/workflow-executions
```

Body:

```json
{
  "workflowId": "<agentGraphId>",
  "documentIds": ["<documentId>"],
  "initialState": {
    "analysis_label": "orbit"
  }
}
```

You can also select documents by scope:

```json
{
  "workflowId": "<agentGraphId>",
  "scope": {
    "deviceBound": false
  }
}
```

### Inspect an execution

```http
GET /api/service/workflow-executions/:id
```

### List or read documents

```http
GET /api/service/documents?limit=20&deviceBound=false
GET /api/service/documents/:id
```

### Change document visibility

```http
POST /api/service/documents/visibility
```

Body:

```json
{
  "documentIds": ["<documentId>"],
  "visibility": "public"
}
```

### OpenAPI

```http
GET /api/openapi.json
```

This spec is generated from the shared service contracts so the public surface and the implementation stay aligned.

## Dashboard Uploads

Dashboard uploads are session-authenticated and intended for operator-driven review.

### Presign an ad-hoc upload

```http
POST /api/dashboard/documents/uploads/presign
```

Body:

```json
{
  "projectId": "<projectId>",
  "contentType": "image/png",
  "size": 12345
}
```

### Acknowledge the ad-hoc upload

```http
POST /api/dashboard/documents/uploads/ack
```

Body:

```json
{
  "objectKey": "uploads/.../dashboard/.../image.png"
}
```

This creates the document and publishes a dashboard document event. Unlike the device path, it does **not** auto-run a workflow. Operators choose which saved workflow to queue next.

## Queue Any Workflow Against A Saved Document

```http
POST /api/dashboard/documents/:id/run
```

Body:

```json
{
  "workflowId": "<agentGraphId>"
}
```

Response:

```json
{
  "status": "queued",
  "documentId": "<documentId>",
  "workflowId": "<agentGraphId>",
  "workflowName": "OCR Review Supervisor"
}
```

This lets operators compare workflows, rerun analysis, or process dashboard-uploaded documents without changing a device's default assignment.

## Auth Model

- **Device ingestion** uses API keys scoped to organization, project, and device.
- **Service orchestration** uses API keys scoped to organization and project.
- API keys are stored as SHA-256 hashes.
- **Dashboard operations** use better-auth session cookies.
- Local debug mode can bootstrap a seeded session when `API_DEBUG=true`.

## Dashboard Document APIs

### Browse or search documents

```http
GET /api/dashboard/documents?organizationId=<orgId>&query=<text>&limit=<n>&cursor=<id>
```

Notes:

- `organizationId` is required in local debug mode or when there is no active organization in the session.
- `query` is optional.
- Search always includes lexical ranking.
- When `DOCUMENT_SEARCH_MODE=hybrid`, the API also blends in semantic description matches when embeddings are available.

Response fields include:

- `id`
- `objectKey`
- `contentType`
- `sizeBytes`
- `createdAt`
- `description`
- `thumbnailUrl`
- `distance`

### Read OCR outputs for a document

```http
GET /api/dashboard/documents/:id/ocr
```

Each OCR result includes:

- `ocrResultId`
- `ocrCreatedAt`
- `modelLabel`
- `text`
- `avgConfidence`
- `result`

### Read segmentation outputs for a document

```http
GET /api/dashboard/documents/:id/segmentations
```

Each segmentation result includes:

- `segmentationId`
- `segmentationCreatedAt`
- `modelLabel`
- `prompt`
- nested derived `document` data when a segmented image was stored

## Grounded Collection Chat

```http
POST /api/dashboard/documents/chat
```

Notes:

- Dashboard auth is session-based and scoped to the active organization.
- The request body follows the TanStack AI chat shape.
- The current UI uses organization scope, while the endpoint also accepts optional `projectIds`, `deviceIds`, and `documentIds`.
- Responses stream over Server-Sent Events.
- Source cards are emitted as `assistant_sources` events and include document metadata plus matched excerpts.
- The dashboard bundle proxies this endpoint locally at `/api/documents/chat`.

The chat layer is grounded in stored document descriptions, OCR text, and related segmentation context.

## Dashboard Realtime Feed

```http
GET /api/dashboard/realtime
```

This Server-Sent Events feed publishes:

- document creation
- OCR creation
- description upserts
- segmentation creation
- run creation
- run step changes
- run completion

The dashboard bundle proxies this feed locally at `/api/realtime/dashboard` to power the live Docs and Runs tabs.

## Health Checks

```text
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
