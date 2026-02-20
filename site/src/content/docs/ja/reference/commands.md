---
title: コマンド一覧
description: 各サービスの開発でよく使うコマンド。
---

## データベース

```bash
cd server/packages/db && bun run db:generate   # マイグレーション生成
cd server/packages/db && bun run db:migrate    # マイグレーション適用
cd server/packages/db && bun run db:studio     # Drizzle Studio UI
cd server/packages/db && bun run db:seed       # シードデータ
```

## Goモデル生成

スキーマ変更後、Drizzle管理のPostgresスキーマからGoモデルを再生成：

```bash
cd models/db && go run ./cmd/introspect
```

## リント＆解析

```bash
cd server && bunx biome check packages         # TypeScriptリント/フォーマット
cd client && flutter analyze                   # Dart静的解析
```

## テスト

```bash
cd client && flutter test                      # Flutterウィジェットテスト
```

## サービスの起動

**ワンコマンド**（推奨）：

```bash
tilt up
```

Tilt UI は通常 `http://localhost:10350`（ログ確認と手動リソース実行）。

**手動起動：**

```bash
cd server/packages/api && bun run dev          # API :3000
cd server/packages/dashboard && bun run dev    # ダッシュボード :3001
cd models/agents && go run .                   # エージェント :3020
cd models/mcp && go run .                      # MCP :3021
npx inngest-cli@latest dev -u http://localhost:3020/api/inngest
cd client && flutter run -d chrome             # Flutterクライアント
```

## ドキュメントサイト

```bash
cd site && bun run dev                         # ドキュメントサイト（既定: :4321）
```
