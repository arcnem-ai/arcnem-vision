---
title: APIの例
description: デバイス経由の自動取り込み、ダッシュボード経由の単発アップロード、ワークフロー投入、リアルタイム監視の例。
---

Arcnem Vision には、大きく分けて2つの運用APIがあります。

- **デバイス / APIキー経路**: 自動取り込み向け
- **ダッシュボード / セッション経路**: 運用担当者によるアップロード、閲覧、ワークフロー投入向け

## デバイス経路

この経路は、デバイスや外部連携から自動で画像を受け取るためのものです。

### 1. 署名付きアップロードURLを取得

```bash
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'
```

### 2. ストレージへ直接アップロード

```bash
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png
```

### 3. アップロードを確定

```bash
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

3番目の `ack` の後で、API はオブジェクトを検証し、ドキュメントを作成し、`document/process.upload` を発火します。以後は、そのデバイスに割り当てられたワークフローが読み込まれ、OCR、説明文生成、埋め込み、分岐、セグメンテーションなどが実行されます。

## ダッシュボード経路

ダッシュボードからのアップロードはセッション認証で行われ、単発の確認や比較検証向けです。

### 単発アップロード用の presign を取得

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

### 単発アップロードを確定

```http
POST /api/dashboard/documents/uploads/ack
```

Body:

```json
{
  "objectKey": "uploads/.../dashboard/.../image.png"
}
```

この経路では、ドキュメント作成とダッシュボード向けイベント配信までは行われますが、**ワークフローは自動実行されません**。次にどの保存済みワークフローを流すかは、運用担当者が選びます。

## 保存済みドキュメントにワークフローを投入する

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

このエンドポイントを使うと、同じ画像に対して別のワークフローを比較したり、あとから再実行したりできます。デバイスのデフォルト割り当てを書き換える必要はありません。

## 認証モデル

- **デバイス経路** は、組織・プロジェクト・デバイス単位にスコープされた API キーを使います。
- API キー自体は SHA-256 ハッシュで保存されます。
- **ダッシュボード経路** は better-auth のセッション Cookie を使います。
- ローカル開発では、`API_DEBUG=true` のときシード済みセッションを起動できます。

## ダッシュボードのドキュメントAPI

### 一覧取得 / 検索

```http
GET /api/dashboard/documents?organizationId=<orgId>&query=<text>&limit=<n>&cursor=<id>
```

補足:

- `organizationId` は、認証済みのダッシュボードセッション文脈がない場合にのみ必要です。
- `query` は任意です。
- 検索では常に語彙検索を含めます。
- `DOCUMENT_SEARCH_MODE=hybrid` の場合は、埋め込みがあると説明文ベースのセマンティック検索もブレンドします。

レスポンスには次のようなフィールドが含まれます。

- `id`
- `objectKey`
- `contentType`
- `sizeBytes`
- `createdAt`
- `description`
- `thumbnailUrl`
- `distance`

### OCR結果を読む

```http
GET /api/dashboard/documents/:id/ocr
```

各 OCR 結果には次の情報が含まれます。

- `ocrResultId`
- `ocrCreatedAt`
- `modelLabel`
- `text`
- `avgConfidence`
- `result`

### セグメンテーション結果を読む

```http
GET /api/dashboard/documents/:id/segmentations
```

各セグメンテーション結果には次の情報が含まれます。

- `segmentationId`
- `segmentationCreatedAt`
- `modelLabel`
- `prompt`
- 保存済みの派生画像がある場合は、その `document` 情報

## 根拠付きコレクションチャット

```http
POST /api/dashboard/documents/chat
```

補足:

- セッション認証済みで、アクティブな組織コンテキストに入っている必要があります。
- リクエストボディは TanStack AI のチャット形式に沿っています。
- `messages` に加えて `conversationId` と `scope` を任意で渡せます。
- 現在の UI は組織単位で使いますが、API 側では `projectIds`、`apiKeyIds`、`documentIds` も受け取れます。
- レスポンスは Server-Sent Events でストリーミングされます。
- 出典カードは `assistant_sources` イベントとして流れ、ドキュメント情報や一致箇所の抜粋を含みます。
- ダッシュボード本体はこのエンドポイントをローカルの `/api/documents/chat` からプロキシします。

## ダッシュボードのリアルタイムフィード

```http
GET /api/dashboard/realtime
```

- Server-Sent Events を使います。
- ドキュメント系イベント: `document-created`, `ocr-created`, `description-upserted`, `segmentation-created`
- 実行系イベント: `run-created`, `run-step-changed`, `run-finished`
- ダッシュボード本体ではローカルの `/api/realtime/dashboard` にプロキシして利用します。

## ヘルスチェック

```text
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
