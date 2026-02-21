---
title: Embeddings & pgvector
description: エンベディングモデル、次元数、ベクターストレージの解説。
---

## 概要

エンベディングは、テキストや画像コンテンツを類似検索用の浮動小数点ベクトルに変換します。

Arcnem Vision では、エンベディングを次の2つのテーブルに保存します。

| テーブル | 用途 | FK参照先 |
|-------|---------|-----------|
| `document_embeddings` | ドキュメント由来の生ベクトル | `documents.id` |
| `document_description_embeddings` | 説明文テキストのベクトル | `document_descriptions.id` |

各行には以下が含まれます。

- `embedding`（pgvectorカラム）
- `embedding_dim`（保存されたベクトル長）
- `model_id`（どのモデルがベクトルを生成したか）

## 現在のスキーマ

現在のスキーマでは可変長ベクトルを保存し、行ごとに次元数を追跡しています。

```typescript
// server/packages/db/src/schema/projectSchema.ts
embeddingDim: integer("embedding_dim").notNull().default(768),
embedding: variableVector("embedding").notNull(),
check(
  "document_embeddings_embedding_dim_matches_vector",
  sql`vector_dims(${table.embedding}) = ${table.embeddingDim}`,
),
```

## 運用上の制約

- 保存されるベクトル長は `embedding_dim` と一致する必要があります（`vector_dims(embedding) = embedding_dim`）。
- 現在のスキーマには、`embedding_dim = 768` と `embedding_dim = 1536` に対する部分 HNSW インデックスがあります。
- 類似検索が意味を持つのは、クエリベクトルとインデックス済みベクトルが互換性のあるモデル空間から生成されている場合のみです。
- インデックス作成フローとクエリフローの両方で、`model_id` と `embedding_dim` を一貫させてください。
