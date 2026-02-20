# Embeddings in Arcnem Vision

## Overview

Embeddings convert text or image content into float vectors for similarity search.

Arcnem Vision stores embeddings in two tables:

| Table | Purpose | FK target |
|-------|---------|-----------|
| `document_embeddings` | Raw document-derived vectors | `documents.id` |
| `document_description_embeddings` | Description text vectors | `document_descriptions.id` |

Each row includes:

- `embedding` (pgvector column)
- `embedding_dim` (stored vector length)
- `model_id` (which model produced the vector)

## Current Schema

The current schema stores variable-length vectors and tracks per-row dimensions.

```typescript
// server/packages/db/src/schema/projectSchema.ts
embeddingDim: integer("embedding_dim").notNull().default(768),
embedding: variableVector("embedding").notNull(),
check(
  "document_embeddings_embedding_dim_matches_vector",
  sql`vector_dims(${table.embedding}) = ${table.embeddingDim}`,
),
```

## Operational Constraints

- Stored vector length must match `embedding_dim` (`vector_dims(embedding) = embedding_dim`).
- The schema currently has partial HNSW indexes for `embedding_dim = 768` and `embedding_dim = 1536`.
- Similarity search is only meaningful when query and indexed vectors come from compatible model spaces.
- Keep `model_id` and `embedding_dim` consistent between indexing and query flows.

## Related Docs

- [`docs/langchaingo.md`](langchaingo.md) -- LangChainGo integration for text embeddings, agents, and chains
