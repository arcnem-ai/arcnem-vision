---
title: API Examples
description: Upload flow using presigned S3 URLs and the agent processing pipeline.
---

## Upload Flow

```bash
# 1. Get a presigned upload URL
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'

# 2. Upload directly to S3 with the returned uploadUrl
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png

# 3. Acknowledge — triggers the full agent pipeline
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

After step 3, Inngest fires `document/process.upload`. The agent graph takes it from there — CLIP embedding, description generation, vector indexing. Done.

## Auth Model

Authentication uses better-auth with the API key plugin. API keys are scoped to org/project/device, stored as SHA-256 hashes. The Flutter client authenticates via API key verification. Redis is used as secondary session storage. The dashboard uses session-based auth.

## Dashboard Documents Endpoint

Dashboard document browsing and search use:

```http
GET /api/dashboard/documents?organizationId=<orgId>&query=<text>&limit=<n>&cursor=<id>
```

Notes:

- `organizationId` is required.
- `query` is optional; when present, the API tries semantic ranking first (embedding distance) and falls back to lexical matching.
- Dashboard auth is session-based (`better-auth.session_token` cookie or `DASHBOARD_SESSION_TOKEN` in local debug mode).
- Response shape:
  - `documents`: list of cards (`id`, `objectKey`, `contentType`, `sizeBytes`, `createdAt`, `description`, `thumbnailUrl`, `distance`)
  - `nextCursor`: pagination cursor (`null` for query-based search responses)

## Health Checks

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
