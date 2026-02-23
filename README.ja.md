<p align="center">
  <img src="arcnem-logo.svg" alt="Arcnem" width="120" />
</p>

<h1 align="center">Arcnem Vision</h1>

<p align="center">
  <strong>機械に「見る」を教え、エージェントに「どうするか」を任せる。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="#クイックスタート">クイックスタート</a> ·
  <a href="#アーキテクチャ">アーキテクチャ</a> ·
  <a href="site/">ドキュメントサイト</a> ·
  <a href="docs/">ディープダイブ</a>
</p>

---

Arcnem Visionは、画像を「理解」に変えるオープンソースプラットフォームです。オンデバイスインテリジェンスを搭載したFlutterアプリから写真をアップロードすると、LangGraphでオーケストレーションされ、MCPで接続され、データベースから完全に設定されたAIエージェント群が、エンベディングの生成、説明文の作成、そしてメタデータではなく意味による検索を可能にします。

4つの言語。5つのサービス。カメラのシャッターからセマンティック検索まで、1本のパイプライン。

**ここが面白い：**

- **データベース駆動のエージェントグラフ** — AIワークフローをコードではなく行として定義。再デプロイなしで組織ごとに処理パイプラインを切り替え可能。
- **GenUIチャットインターフェース** — AIはテキストで返答するだけではない。カード、ギャラリー、インタラクティブコンポーネントなど、実際のFlutterウィジェットをJSONからランタイムで生成。
- **オンデバイスGemma** — インテント解析はネットワークに到達する前にスマートフォン上でローカル実行。デフォルトでプライバシー重視。
- **CLIPベクトル検索** — 画像とその説明文を同一の768次元空間に埋め込み。画像で検索、テキストで検索、雰囲気で検索。
- **ビジュアルワークフロービルダー** — Reactダッシュボードでエージェントグラフをドラッグ＆ドロップ：ワーカー、ツール、スーパーバイザー、エッジ、すべてを視覚的に構築。
- **MCPツールがファーストクラス** — オープンなModel Context Protocolに準拠した5つの登録ツール。エージェントが呼び出す。あなたも呼び出せる。

## 技術スタック

| レイヤー | 技術 | 役割 |
|---|---|---|
| **クライアント** | Flutter, Dart, flutter_gemma, GenUI, fpdart | カメラキャプチャ、オンデバイスLLM、AI生成UI、関数型エラーハンドリング |
| **API** | Bun, Hono, better-auth, Inngest, Pino | RESTルート、署名付きアップロード、ジョブスケジューリング、構造化ログ |
| **ダッシュボード** | React 19, TanStack Router, Tailwind, shadcn/ui | ワークフロービルダー、ドキュメントビューア、管理インターフェース |
| **エージェント** | Go, Gin, LangGraph, LangChain, inngestgo | グラフベースのエージェントオーケストレーション、ReActワーカー、ステップレベルトレーシング |
| **MCP** | Go, MCP go-sdk, replicate-go, GORM | CLIPエンベディング、説明文生成、類似検索ツール |
| **ストレージ** | Postgres 18 + pgvector, S3互換, Redis | ベクターインデックス、オブジェクトストレージ、セッションキャッシュ |

## アーキテクチャ

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Flutter    │────▶│   Hono API   │────▶│     Inngest     │
│   Client     │     │   (Bun)      │     │   Event Queue   │
│              │     │              │     │                 │
│ GenUI + Gemma│     │ Presigned S3 │     └────────┬────────┘
└─────────────┘     │ better-auth  │              │
                    └──────────────┘              ▼
┌─────────────┐                        ┌──────────────────┐
│    React     │                        │   Go Agents      │
│  Dashboard   │                        │                  │
│              │     ┌──────────┐       │ LangGraph loads  │
│  Workflow    │────▶│ Postgres │◀──────│ graph from DB,   │
│  Builder     │     │ pgvector │       │ executes nodes   │
└─────────────┘     └──────────┘       └────────┬─────────┘
                         ▲                      │
                         │               ┌──────▼─────────┐
                    ┌────┴───┐           │   MCP Server    │
                    │   S3   │           │                 │
                    │Storage │           │ CLIP embeddings │
                    └────────┘           │ Descriptions    │
                                         │ Similarity      │
                                         └─────────────────┘
```

**パイプライン：** クライアントが画像をキャプチャ → APIが署名付きS3 URLを発行 → クライアントが直接アップロード → APIが確認してInngestイベントを発火 → GoエージェントサービスがPostgresからドキュメントのエージェントグラフを読み込み → LangGraphがワークフローを構築・実行 → ワーカーノードがLLMを呼び出し、ツールノードがMCPを呼び出し → MCPがCLIPエンベディングと説明文を生成 → すべてがHNSWコサインインデックス付きでPostgresに格納 → 意味で検索可能に。

**エージェントグラフはコードではなくデータ。** テンプレートがノード、エッジ、ツールを持つ再利用可能なワークフローを定義。インスタンスがテンプレートを組織にバインド。3つのノードタイプ：
- **Worker** — MCPツールにアクセスできるReActエージェント
- **Tool** — 入出力マッピング付きの単一MCPツール呼び出し
- **Supervisor** — ワーカー間のマルチエージェントオーケストレーション

すべての実行が`agent_graph_runs`と`agent_graph_run_steps`でステップごとにトレース — 状態差分、タイミング、エラー、全体像を把握。

## リポジトリ構成

```
arcnem-vision/
├── client/                 Flutterアプリ — GenUI、Gemma、カメラ、ギャラリー
│   ├── lib/screens/        認証、カメラ、ダッシュボード、ローディング
│   ├── lib/services/       アップロード、ドキュメント、GenUI、インテント解析
│   └── lib/catalog/        AI生成UIのためのカスタムウィジェットカタログ
├── server/                 Bunワークスペース
│   ├── packages/api/       Honoルート、ミドルウェア、認証、S3、Inngest
│   ├── packages/db/        Drizzleスキーマ（23テーブル）、マイグレーション、シード
│   ├── packages/dashboard/ React管理画面 — ワークフロービルダー、ドキュメントビューア
│   └── packages/shared/    Envヘルパー
├── models/                 Goワークスペース
│   ├── agents/             Inngestハンドラー、LangGraph実行エンジン
│   ├── mcp/                MCPサーバー — 5ツール（エンベディング、検索）
│   ├── db/                 GORM genイントロスペクション（スキーマ → Goモデル）
│   └── shared/             共通env読み込み
└── docs/                   ディープダイブ — エンベディング、LangChain、LangGraph、GenUI
```

## クイックスタート

### 1. クローンとインストール

```bash
git clone https://github.com/arcnem-ai/arcnem-vision.git
cd arcnem-vision
```

```bash
cd server && bun i            # TypeScript依存関係
cd models && go work sync     # Goワークスペース
cd client && flutter pub get  # Flutterパッケージ
```

### 2. 環境設定

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
- **またはホスト型S3互換バケット** — AWS S3 / Cloudflare R2 / Railway Object Storage / Backblaze B2 など
- **OpenAI APIキー** — `models/agents/.env`に`OPENAI_API_KEY`
- **Replicateトークン** — `models/mcp/.env`に`REPLICATE_API_TOKEN`
- **データベースURL** — DB関連のenvファイルに`postgres://postgres:postgres@localhost:5480/postgres`

### 3. インフラの起動

```bash
docker compose up -d postgres redis minio minio-init
```

### 4. マイグレーションとシード

```bash
cd server/packages/db && bun run db:generate && bun run db:migrate && bun run db:seed
```

シードが使用可能なAPIキーを出力します。開発中のFlutterアプリで自動認証するには、`client/.env`で`DEBUG_SEED_API_KEY=...`を設定。

### 5. 起動

**ワンコマンド**（推奨）：

```bash
tilt up
```

`tilt up` はローカルスタック全体を起動し、TiltのダッシュボードUI（通常 `http://localhost:10350`）で以下を行えます。

- 各サービスのリアルタイムログ確認
- DBシードなど手動リソースの実行
- DBイントロスペクトなど補助フローの実行

**手動起動** — それぞれ別のターミナルで：

```bash
cd server/packages/api && bun run dev                    # API :3000
cd server/packages/dashboard && bun run dev              # ダッシュボード :3001
cd models/agents && go run .                             # エージェント :3020
cd models/mcp && go run .                                # MCP :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest  # ジョブキュー
cd client && flutter run -d chrome                       # Flutterクライアント
```

### ヘルスチェック

```
GET http://localhost:3000/health   # API
GET http://localhost:3020/health   # Agents
GET http://localhost:3021/health   # MCP
```

## APIの例

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

## よく使うコマンド

```bash
# データベース
cd server/packages/db && bun run db:generate   # マイグレーション生成
cd server/packages/db && bun run db:migrate    # マイグレーション適用
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # シードデータ

# Goモデル生成（スキーマ変更後）
cd models/db && go run ./cmd/introspect

# リント
cd server && bunx biome check packages         # TypeScript
cd client && flutter analyze                   # Dart
cd client && flutter test                      # Flutterテスト
```

## 必要条件

- Docker + Docker Compose
- Bun（サーバー）
- Go 1.25+（エージェント、MCP）
- CompileDaemon（`tilt up` のGoホットリロード用）
- Flutter SDK（クライアント）
- Inngest CLI（`npx inngest-cli@latest`）
- S3互換オブジェクトストレージ（Docker ComposeのローカルMinIO、またはS3/R2/Railway等のホスト型）
- Tilt（推奨）

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [site/](site/) | オンボーディングと参照用のローカルドキュメントサイト（Starlight） |
| [docs/README.md](docs/README.md) | ディープダイブ一覧と運用方針 |
| [docs/embeddings.md](docs/embeddings.md) | 現在のエンベディング実装と運用上の制約 |
| [docs/langgraphgo.md](docs/langgraphgo.md) | グラフオーケストレーションパターン、並列実行、チェックポイント、ヒューマンインザループ |
| [docs/langchaingo.md](docs/langchaingo.md) | LLMプロバイダー、チェーン、エージェント、ツール、MCPブリッジ |
| [docs/genui.md](docs/genui.md) | Flutter GenUI SDK、DataModelバインディング、A2UIプロトコル、カスタムウィジェット |

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) にコントリビューション手順があります。AIコーディングエージェントを使う場合は [AGENTS.md](AGENTS.md) も参照してください。

---

<p align="center">
  東京の<a href="https://arcnem.ai">Arcnem</a>が開発。
</p>
