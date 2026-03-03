---
title: クイックスタート
description: Arcnem Visionをクローン、設定、ローカルで実行する方法。
---

:::tip[必要なAPIキーはたった2つ]
Arcnem Visionを始めるのに必要なのは[OpenAI APIキー](https://platform.openai.com/api-keys)と[Replicate APIトークン](https://replicate.com/account/api-tokens)だけです。Postgres、Redis、S3（MinIO）、Inngestなど、その他すべてはDocker Composeでローカル実行されます。`.env.example`のデフォルト値がそのまま使えます。
:::

## 必要条件

- Docker + Docker Compose
- Bun（サーバー）
- Go 1.25+（エージェント、MCP）
- CompileDaemon（Goホットリロード — `go install github.com/githubnemo/CompileDaemon@latest`）
- Flutter SDK（クライアント）
- Tilt

## 1. クローンと設定

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

すべての`.env.example`を`.env`にコピー：

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

外部サービスで必要なのはAPIキー2つだけ：

- **[OpenAI APIキー](https://platform.openai.com/api-keys)** → `models/agents/.env`に`OPENAI_API_KEY`
- **[Replicate APIトークン](https://replicate.com/account/api-tokens)** → `models/mcp/.env`に`REPLICATE_API_TOKEN`

それ以外はすべてローカル開発用に設定済み。データベース、S3、Redisは`docker-compose.yaml`のDockerで起動され、`.env.example`のデフォルト値がそのまま使えます。

## 2. すべてを起動

```bash
tilt up
```

これだけです。Tiltがすべての依存関係をインストールし、Postgres/Redis/MinIOを起動し、マイグレーションを実行し、すべてのサービス（API、ダッシュボード、エージェント、MCP、Inngest、Flutterクライアント、ドキュメントサイト）を起動します。Tilt UI（`http://localhost:10350`）でログの確認やリソースの管理ができます。

## 3. データベースのシード

Tilt UIで**seed-database**リソースをクリックし、トリガーボタンを押します。シードが使用可能なAPIキーを出力します。開発中のFlutterアプリで自動認証するには、`client/.env`に`DEBUG_SEED_API_KEY=...`を設定してください。

## ヘルスチェック

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## S3設定の詳細

ローカル開発のデフォルトは`docker-compose.yaml`のMinIOを使用。`.env.example`ファイルに動作するデフォルト値が設定済み：

- `S3_ACCESS_KEY_ID=minioadmin`
- `S3_SECRET_ACCESS_KEY=minioadmin`
- `S3_BUCKET=arcnem-vision`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_REGION=us-east-1`
- `S3_USE_PATH_STYLE=true`（agentsのみ）

ホスト型ストレージの場合は、AWS S3 / Cloudflare R2 / Railway Object Storage / Backblaze B2の認証情報に置き換えてください。
