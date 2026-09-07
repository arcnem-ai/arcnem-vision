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
cd site && bun run dev                         # ドキュメントサイト :4321
```
