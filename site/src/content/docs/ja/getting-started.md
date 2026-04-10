---
title: クイックスタート
description: コアサービスをローカルで起動し、ダッシュボードまたはデバイスAPIキー経由で画像ワークフローを試す方法。
---

:::tip[まずはコアサービスから触るのがおすすめです]
Arcnem Vision には Flutter のデモクライアントも含まれていますが、プロダクトの価値が最も分かりやすいのはダッシュボードとサーバー側の処理基盤です。まずは「画像を取り込む → ワークフローを動かす → 結果と実行履歴を見る」という流れから試してください。
:::

## 必要条件

- Docker + Docker Compose
- Bun
- Go 1.25+（エージェント、MCP）
- CompileDaemon（`go install github.com/githubnemo/CompileDaemon@latest`）
- Flutter SDK
- Tilt

`tilt up` では Flutter も一緒に起動するため Flutter SDK は必要ですが、評価の入口としてはダッシュボードとサーバー側を先に見るのが最短です。

## 1. クローンと設定

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

すべての `.env.example` を `.env` にコピーします。

```bash
cp server/packages/api/.env.example server/packages/api/.env
cp server/packages/db/.env.example  server/packages/db/.env
cp server/packages/dashboard/.env.example server/packages/dashboard/.env
cp models/agents/.env.example       models/agents/.env
cp models/mcp/.env.example          models/mcp/.env
cp client/.env.example              client/.env
```

外部サービスで必要なのは次の2つだけです。

- **[OpenAI APIキー](https://platform.openai.com/api-keys)** → `models/agents/.env` の `OPENAI_API_KEY`
- **同じOpenAIキーをダッシュボードでも使う場合** → `server/packages/dashboard/.env` の `OPENAI_API_KEY`
- **[Replicate APIトークン](https://replicate.com/account/api-tokens)** → `models/mcp/.env` の `REPLICATE_API_TOKEN`

それ以外はローカル開発向けにほぼ初期設定済みです。Postgres、Redis、MinIO は `docker-compose.yaml` から起動されます。

## 2. スタックを起動

```bash
tilt up
```

Tilt が依存サービスの起動、マイグレーション、各アプリの立ち上げまでまとめて面倒を見ます。API、ダッシュボード、エージェント、MCP、Inngest、ドキュメントサイト、Flutter デモクライアントが一緒に起動します。ログ確認や手動ジョブの実行は Tilt UI（`http://localhost:10350`）から行えます。

## 3. データベースをシード

Tilt UI で **seed-database** を実行します。

シードでは次のものが用意されます。

- デモ用の組織、プロジェクト、デバイス、APIキー
- 編集可能なワークフローと再利用できるテンプレート
- 説明文生成、OCR、品質判定、セグメンテーション向けのサンプル画像
- OCR結果、説明文、埋め込み、セグメンテーション、実行履歴のサンプル
- ローカル開発用のダッシュボードセッション

`.env.example` では `API_DEBUG=true` が有効になっているので、シード後はダッシュボードがローカル用セッションに入れる状態になります。

Flutter 側でもシード済み API キーを使いたい場合は、`client/.env` に `DEBUG_SEED_API_KEY=...` を設定してください。

## 4. まず見るべきコア体験

1. `http://localhost:3001` を開きます。
2. **Projects & Devices** で、シード済みデバイスと割り当て済みワークフローを確認します。
3. **Workflow Library** で、テンプレート一覧やグラフの中身を見ます。
4. **Docs** で、シード済みドキュメントを見るか、新しい画像をダッシュボードから追加します。
5. **Runs** で、初期状態、各ステップの差分、最終状態、エラーを確認します。

## 5. 2つの取り込み経路を試す

### デバイス / APIキー経路

デバイスAPIキーを使うと、自動処理の流れを確認できます。

```bash
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"contentType":"image/png","size":12345}'
```

続いて返ってきた S3 URL に画像をアップロードし、最後に `/api/uploads/ack` を呼びます。`ack` でオブジェクト検証とドキュメント作成が行われ、そのデバイスに割り当てられたワークフローが `document/process.upload` としてキューに入ります。

### ダッシュボード経路

**Docs** タブからは、運用担当者が単発で画像を投入できます。

1. **Add From Dashboard** をクリックします。
2. プロジェクトを選んで画像をアップロードします。
3. 保存されたドキュメントを開きます。
4. 任意の保存済みワークフローを選んで実行します。

この経路は、スポット確認、比較検証、再実行に向いています。デバイスにひもづく自動処理とは切り離されているため、既存運用を崩さずに同じ画像へ別のワークフローを試せます。

## ヘルスチェック

```text
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## S3設定の詳細

ローカル開発では `docker-compose.yaml` の MinIO を使います。`.env.example` にはそのまま動くデフォルト値が入っています。

- `S3_ACCESS_KEY_ID=minioadmin`
- `S3_SECRET_ACCESS_KEY=minioadmin`
- `S3_BUCKET=arcnem-vision`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_REGION=us-east-1`
- `S3_USE_PATH_STYLE=true`（agentsのみ）

ホスト型ストレージを使う場合は、AWS S3、Cloudflare R2、Railway Object Storage、Backblaze B2 などの認証情報に置き換えてください。
