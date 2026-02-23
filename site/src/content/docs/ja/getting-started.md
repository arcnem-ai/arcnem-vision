---
title: クイックスタート
description: Arcnem Visionをクローン、設定、ローカルで実行する方法。
---

## 必要条件

- Docker + Docker Compose
- Bun（サーバー）
- Go 1.25+（エージェント、MCP）
- CompileDaemon（`tilt up` のGoホットリロード用）
- Flutter SDK（クライアント）
- Inngest CLI（`npx inngest-cli@latest`）
- S3互換オブジェクトストレージ（Docker ComposeのローカルMinIO、またはS3/R2/Railway等のホスト型）
- Tilt（推奨）

## 1. クローンとインストール

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

```bash
cd server && bun i            # TypeScript依存関係
cd models && go work sync     # Goワークスペース
cd client && flutter pub get  # Flutterパッケージ
```

## 2. 環境設定

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

必要なもの：
- **S3互換ストレージ設定** — ローカル開発のデフォルトは`docker-compose.yaml`のMinIO。`server/packages/api/.env`、`server/packages/db/.env`、`models/agents/.env`に次を設定：
  - `S3_ACCESS_KEY_ID=minioadmin`
  - `S3_SECRET_ACCESS_KEY=minioadmin`
  - `S3_BUCKET=arcnem-vision`
  - `S3_ENDPOINT=http://localhost:9000`
  - `S3_REGION=us-east-1`
  - `S3_USE_PATH_STYLE=true`（agentsのみ）
- **またはホスト型S3互換バケット** — AWS S3 / Cloudflare R2 / Railway Object Storage など
- **OpenAI APIキー** — `models/agents/.env`に`OPENAI_API_KEY`
- **Replicateトークン** — `models/mcp/.env`に`REPLICATE_API_TOKEN`
- **データベースURL** — DB関連のenvファイルに`postgres://postgres:postgres@localhost:5480/postgres`

## 3. インフラの起動

```bash
docker compose up -d postgres redis minio minio-init
```

## 4. マイグレーションとシード

```bash
cd server/packages/db && bun run db:generate && bun run db:migrate && bun run db:seed
```

シードが使用可能なAPIキーを出力します。開発中のFlutterアプリで自動認証するには、`client/.env`で`DEBUG_SEED_API_KEY=...`を設定。

## 5. 起動

**ワンコマンド**（推奨）：

```bash
tilt up
```

`tilt up` はローカルスタック全体を起動し、Tilt UI（通常 `http://localhost:10350`）でログ確認やシード/イントロスペクトなどの手動リソース実行ができます。

**手動起動** — それぞれ別のターミナルで：

```bash
cd server/packages/api && bun run dev                    # API :3000
cd server/packages/dashboard && bun run dev              # ダッシュボード :3001
cd models/agents && go run .                             # エージェント :3020
cd models/mcp && go run .                                # MCP :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest  # ジョブキュー
cd client && flutter run -d chrome                       # Flutterクライアント
```

## ヘルスチェック

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```
