---
title: コマンド一覧
description: 各サービスの開発でよく使うコマンド。
---

## サービスの起動

```bash
tilt up
```

Tiltが依存関係をインストールし、インフラを起動し、マイグレーションを実行し、すべてのサービスを起動します。Tilt UI（`http://localhost:10350`）でログの確認やシード・イントロスペクトなどの手動リソース実行ができます。

## データベース

```bash
cd server/packages/db && bun run db:generate   # マイグレーション生成
cd server/packages/db && bun run db:migrate    # マイグレーション適用
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # シードデータ
```

Tiltは起動時に`db:generate`と`db:migrate`を自動実行。シードとイントロスペクトはTilt UIの手動トリガーとして利用可能。

### 本番環境のブートストラップ

```bash
cd server/packages/api && bun run bootstrap    # 新しいデプロイを準備
cd server/packages/api && bun run deploy:prepare # データベースを待ってマイグレーションし、ブートストラップ
```

`db:seed` は使い捨てのローカルデータベースにデモデータを入れるものです。デプロイ環境では、マイグレーションの後に代わりに `bootstrap` を実行します。モデルとツールのカタログをインストールし、最初のオーナー（`BOOTSTRAP_OWNER_EMAIL`）と組織（`BOOTSTRAP_ORGANIZATION_NAME`）、デフォルトのプロジェクトを作成し、その組織にワークフローが一度もなければスターターワークフローを追加します（アーカイブしたスターターは復活しません）。各ステップは既存のものをスキップするので、デプロイのたびに実行しても安全です。オーナーはメールのコードでサインインするため、サインアップは無効のままにできます。

APIは `AUTH_EMAIL_DELIVERY` の設定に従ってサインインコードを送ります。`resend` はメールで送り（`RESEND_API_KEY` と `TRANSACTIONAL_EMAIL_ADDRESS` が必要）、`log` はAPIのログに書き出します。ログを読める人は誰としてでもサインインできるため、`log` はローカル環境か、デプロイのログにアクセスできるのが自分だけの場合にのみ使ってください。

## Goモデル生成

スキーマ変更後、Drizzle管理のPostgresスキーマからGoモデルを再生成：

```bash
cd models/db && go run ./cmd/introspect
```

Tilt UIの手動トリガーとしても利用可能。

## リント＆解析

```bash
cd server && bunx biome check packages         # TypeScriptリント/フォーマット
```

## テスト

```bash
cd server && bun test                          # API and shared contract tests
```

## ドキュメントサイト

`tilt up`で自動起動、または単体で実行：

```bash
cd server
bun install --frozen-lockfile
bun run --filter arcnem-vision-docs dev         # ドキュメントサイト :4321
```
