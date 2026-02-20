---
title: コントリビューション
description: 変更時に期待される品質チェック、レビュー範囲、ドキュメント更新方針。
---

Arcnem Vision への貢献ありがとうございます。

## まず読むもの

- アーキテクチャとセットアップ: `/README.md`
- 貢献フロー: `/CONTRIBUTING.md`
- AIコーディングエージェント利用時: `/AGENTS.md`

## 推奨チェック

変更範囲に応じて実行してください。

```bash
# client
cd client && flutter analyze
cd client && flutter test

# server workspace
cd server && bunx biome check packages

# スキーマ変更時の Go モデル同期
cd models/db && go run ./cmd/introspect
```

## PRで重視する点

- 変更は1つの関心事に絞る
- 必要ならセットアップ/マイグレーション手順を記載
- UI変更にはスクリーンショットや動画を添付
- 新しい環境変数、ポート、インフラ前提を明記

## ドキュメント更新方針

- オンボーディングに影響する変更は `/site` を更新
- 詳細設計や実装方針の変更は `/docs` を更新
- 可能な範囲で英語版と日本語版を同期

## GitHubテンプレート

`.github/` 配下のIssue/PRテンプレートを使って、報告とレビューの形式を統一してください。
