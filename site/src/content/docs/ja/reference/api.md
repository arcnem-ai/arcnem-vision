---
title: APIの例
description: 署名付きS3 URLを使ったアップロードフローとエージェント処理パイプライン。
---

## アップロードフロー

```bash
# 1. 署名付きアップロードURLを取得
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'

# 2. 返されたuploadUrlでS3に直接アップロード
curl -X PUT "${UPLOAD_URL}" --data-binary @photo.png

# 3. 確認 — エージェントパイプライン全体がトリガーされる
curl -X POST http://localhost:3000/api/uploads/ack \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"objectKey":"uploads/.../photo.png"}'
```

ステップ3の後、Inngestが`document/process.upload`を発火。エージェントグラフがそこから引き継ぎ — CLIPエンベディング、説明文生成、ベクターインデックス作成。完了。

## 認証モデル

better-authとAPIキープラグインを使用。APIキーはorg/project/deviceにスコープされ、SHA-256ハッシュとして保存。FlutterクライアントはAPIキー検証で認証。Redisを副次的なセッションストレージとして使用。ダッシュボードはセッションベースの認証。

## ダッシュボードのドキュメントAPI

ダッシュボードの一覧/検索は次のエンドポイントを使います。

```http
GET /api/dashboard/documents?organizationId=<orgId>&query=<text>&limit=<n>&cursor=<id>
```

ポイント:

- `organizationId` は必須
- `query` 指定時は、まず埋め込み距離ベースの検索を試行し、見つからない場合は語彙検索にフォールバック
- ダッシュボード認証はセッションベース（`better-auth.session_token` Cookie、またはローカルデバッグ時の `DASHBOARD_SESSION_TOKEN`）
- レスポンス:
  - `documents`: カード配列（`id`, `objectKey`, `contentType`, `sizeBytes`, `createdAt`, `description`, `thumbnailUrl`, `distance`）
  - `nextCursor`: ページネーション用カーソル（`query` 検索時は `null`）

## ヘルスチェック

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
