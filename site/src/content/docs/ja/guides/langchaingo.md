---
title: LangChain Go
description: LangChainGoのGoサービスへの統合 — テキストエンベディング、エージェント、チェーン、ツール、MCPブリッジ。
---

`github.com/tmc/langchaingo`（v0.1.14）が arcnem-vision の Go サービスにどう適用されるかを解説します。対象はテキストエンベディング、エージェント、チェーン、ツール、MCPブリッジです。

Go 1.25+ が必要です。

## どこで使われるか

| サービス | そのサービスでの langchaingo の役割 |
|---------|----------------------------|
| `models/agents` | Inngestジョブが、処理パイプラインでテキストエンベッダーとチェーンを利用 |
| `models/mcp` | MCPツールハンドラーが、エージェントツールと同じ基盤ロジックを共有 |
| 将来のエージェントサービス | 埋め込み・検索・説明生成・質疑応答を行うツール付き自律エージェント |

**langchaingo がカバーしないもの**: 画像エンベディング。`Embedder` インターフェースはテキスト専用です（`EmbedDocuments([]string)` / `EmbedQuery(string)`）。画像を直接エンベディングする場合（CLIP、Geminiマルチモーダル、Cohere v4）は、直接API呼び出しまたはマルチモーダルSDKが必要です。詳細は [Embeddings ガイド](/ja/guides/embeddings/) を参照してください。

---

## インストール

```bash
go get github.com/tmc/langchaingo@v0.1.14
```

主なインポート:

```go
import (
    "github.com/tmc/langchaingo/llms"
    "github.com/tmc/langchaingo/llms/openai"
    "github.com/tmc/langchaingo/llms/anthropic"
    "github.com/tmc/langchaingo/llms/googleai"
    "github.com/tmc/langchaingo/llms/ollama"
    "github.com/tmc/langchaingo/agents"
    "github.com/tmc/langchaingo/chains"
    "github.com/tmc/langchaingo/tools"
    "github.com/tmc/langchaingo/embeddings"
    "github.com/tmc/langchaingo/vectorstores"
    "github.com/tmc/langchaingo/schema"
    "github.com/tmc/langchaingo/prompts"
    "github.com/tmc/langchaingo/memory"
)
```

---

## LLMプロバイダー

すべてのプロバイダーは `llms.Model` を実装します。用途に応じて選択します。

```go
// OpenAI（OPENAI_API_KEY 環境変数）
llm, err := openai.New(openai.WithModel("gpt-4.1-mini"))

// Anthropic（ANTHROPIC_API_KEY 環境変数）
llm, err := anthropic.New(anthropic.WithModel("claude-sonnet-4-5-20250929"))

// Google AI（GOOGLE_API_KEY 環境変数）
llm, err := googleai.New(ctx, googleai.WithDefaultModel("gemini-2.0-flash"))

// Ollama（ローカル実行、キー不要）
llm, err := ollama.New(ollama.WithModel("llama3"))
```

ツール呼び出しが必要なエージェントでは OpenAI または Anthropic を使ってください。これらはネイティブな function calling をサポートします。Ollama と Google AI は、プロンプトベースのエージェント（`OneShotAgent`）で利用できます。

---

## テキストエンベディング

LangChainGo はテキストエンベディング生成を扱います。実装詳細とスキーマ制約は [Embeddings ガイド](/ja/guides/embeddings/) を参照してください。

### インターフェース

```go
type Embedder interface {
    EmbedDocuments(ctx context.Context, texts []string) ([][]float32, error)
    EmbedQuery(ctx context.Context, text string) ([]float32, error)
}
```

### Embedder の作成

```go
// OpenAI（デフォルト: text-embedding-ada-002）
llm, _ := openai.New()
embedder, _ := embeddings.NewEmbedder(llm, embeddings.WithBatchSize(100))

// Google AI（v0.1.14時点でデフォルト: text-embedding-005）
llm, _ := googleai.New(ctx)
embedder, _ := embeddings.NewEmbedder(llm)

// Ollama（ローカル）
llm, _ := ollama.New(ollama.WithModel("nomic-embed-text"))
embedder, _ := embeddings.NewEmbedder(llm)
```

### カスタムスキーマへの保存

langchaingo の `vectorstores/pgvector` パッケージは独自テーブルを作成します。私たちは `documents` と `models` への外部キーを持つ独自テーブルを使っているため、langchaingo は生成のみに使い、保存/検索は独自SQLで行います。

```go
// 生成
vec, err := embedder.EmbedQuery(ctx, captionText)

// 保存（GORM）
db.Exec(`
    INSERT INTO document_description_embeddings
      (document_description_id, model_id, dim, embedding)
    VALUES ($1, $2, $3, $4)
`, descriptionID, modelID, len(vec), pgvector.NewVector(vec))

// 検索
db.Raw(`
    SELECT de.document_id, de.embedding <=> $1::vector AS distance
    FROM document_embeddings de
    ORDER BY distance LIMIT $2
`, pgvector.NewVector(queryVec), limit).Scan(&results)
```

---

## ツール

### インターフェース

langchaingo エージェントで使うすべてのツールは、次を実装する必要があります。

```go
type Tool interface {
    Name() string
    Description() string
    Call(ctx context.Context, input string) (string, error)
}
```

### カスタムツール例: 類似ドキュメント検索

```go
type FindSimilarDocsTool struct {
    embedder embeddings.Embedder
    db       *gorm.DB
}

func (t *FindSimilarDocsTool) Name() string {
    return "find_similar_documents"
}

func (t *FindSimilarDocsTool) Description() string {
    return "Find documents similar to a text query. Input: JSON with 'query' (string) and 'limit' (int) fields."
}

func (t *FindSimilarDocsTool) Call(ctx context.Context, input string) (string, error) {
    var req struct {
        Query string `json:"query"`
        Limit int    `json:"limit"`
    }
    if err := json.Unmarshal([]byte(input), &req); err != nil {
        return "", err
    }
    if req.Limit == 0 {
        req.Limit = 5
    }

    queryVec, err := t.embedder.EmbedQuery(ctx, req.Query)
    if err != nil {
        return "", err
    }

    var results []struct {
        DocumentID string  `json:"document_id"`
        Distance   float64 `json:"distance"`
    }
    t.db.Raw(`
        SELECT de.document_id, de.embedding <=> $1::vector AS distance
        FROM document_embeddings de
        ORDER BY distance
        LIMIT $2
    `, pgvector.NewVector(queryVec), req.Limit).Scan(&results)

    out, _ := json.Marshal(results)
    return string(out), nil
}
```

### 組み込みツール

| パッケージ | ツール | 備考 |
|---------|------|-------|
| `tools/calculator` | Calculator | 四則演算 |
| `tools/serpapi` | SerpAPI | Web検索（`SERPAPI_API_KEY` が必要） |
| `tools/duckduckgo` | DuckDuckGo | Web検索（APIキー不要） |
| `tools/wikipedia` | Wikipedia | Wikipedia検索 |
| `tools/scraper` | Scraper | Webページのスクレイピング |
| `tools/sqldatabase` | SQL Database | SQLデータベースへのクエリ |

---

## エージェント

エージェントはユーザー入力に応じて、どのツールを呼ぶかを決定します。実行ループは次の通りです: 推論 -> ツール選択 -> ツール呼び出し -> 再推論 -> 回答。

### エージェント種別

| 種別 | コンストラクタ | 使いどころ |
|------|-------------|-------------|
| `OpenAIFunctionsAgent` | `agents.NewOpenAIFunctionsAgent(llm, tools)` | ネイティブツール呼び出し対応モデル（OpenAI、Anthropic）。最も安定。 |
| `OneShotAgent` | `agents.NewOneShotAgent(llm, tools)` | 任意のLLMで利用可。ReActスタイルのプロンプト。 |
| `ConversationalAgent` | `agents.NewConversationalAgent(llm, tools)` | 任意のLLMで利用可。チャット履歴対応のReActスタイル。 |

### エージェントの作成と実行

```go
agentTools := []tools.Tool{
    &FindSimilarDocsTool{embedder: embedder, db: db},
    &CreateEmbeddingTool{embedder: embedder, db: db},
}

agent := agents.NewOpenAIFunctionsAgent(llm, agentTools)
executor := agents.NewExecutor(agent)

result, err := chains.Run(ctx, executor,
    "Find documents similar to 'sunset over the ocean' and return the top 3")
```

---

## チェーン

チェーンはLLM呼び出しを再利用可能なパイプラインとして構成します。エージェントと違い、チェーンは固定された経路をたどります。

### RetrievalQA（RAG）

```go
retriever := vectorstores.ToRetriever(store, 5,
    vectorstores.WithScoreThreshold(0.7),
)

qaChain := chains.NewRetrievalQAFromLLM(llm, retriever)
answer, err := chains.Run(ctx, qaChain, "What images contain circuit boards?")
```

### チェーンとエージェントの使い分け

| チェーンを使う場合 | エージェントを使う場合 |
|--------------------|--------------------|
| パイプラインが固定で予測可能 | LLMに「何をすべきか」を判断させたい |
| パフォーマンス重視（LLM呼び出しを減らせる） | タスクがオープンエンド |
| ツール選択ロジックが不要 | 複数ツールからLLMに選ばせたい |

---

## MCPツールとLangChainエージェントの橋渡し

MCPサーバーは `github.com/modelcontextprotocol/go-sdk` を使用し、LangChainエージェントは `tools.Tool` インターフェースを使用します。橋渡しの方法は3つあります。

### Option 1: ロジック共有（推奨）

コアロジックを独立関数として実装し、MCPハンドラーとlangchaingoツールの両方から同じコードを呼び出します。

```
models/
  shared/
    embedding/
      create.go        // GenerateEmbedding(ctx, text) -> []float32
      search.go        // FindSimilar(ctx, query, limit) -> []Result
  mcp/
    tools/             // MCP handler -> calls shared/embedding
  agents/
    tools/             // tools.Tool -> calls shared/embedding
```

ネットワークホップなし。依存関係競合なし。両方の実行面で同じ挙動を得られます。

### Option 2: 独自アダプターを実装

公式SDKクライアントを `tools.Tool` に適合するようラップします。

```go
type MCPToolBridge struct {
    name        string
    description string
    callFn      func(ctx context.Context, args map[string]any) (string, error)
}

func (t *MCPToolBridge) Name() string        { return t.name }
func (t *MCPToolBridge) Description() string { return t.description }
func (t *MCPToolBridge) Call(ctx context.Context, input string) (string, error) {
    var args map[string]any
    json.Unmarshal([]byte(input), &args)
    return t.callFn(ctx, args)
}
```

---

## 注意点

1. **次元不一致**: エンベディングは可変長ベクトルとして保存され、`embedding_dim` チェックがあります。生成ベクトル長が `embedding_dim` と一致すること、かつ同じ次元でクエリ/フィルターすること（現在は 768 と 1536 がインデックス対象）を確認してください。

2. **langchaingo の pgvector ストアと独自スキーマの違い**: `vectorstores/pgvector` は独自テーブルを作成します。私たちは外部キー付きの独自テーブルを使うため、langchaingo は生成のみに使用し、保存/検索は独自SQLを使います。

3. **MCP SDKの不一致**: コミュニティ製アダプターは `mark3labs/mcp-go` を使います。私たちは公式の `modelcontextprotocol/go-sdk` を使うため、ロジック共有アプローチを優先してください。

4. **サービスごとの go.mod 分離**: `models/agents`、`models/mcp`、`models/db` はそれぞれ独立モジュールです。共有コードは `models/shared` を使います。

5. **Anthropic はエンベディングを提供しない**: Claude はエンベディングを生成できません。OpenAI、Google、Ollama などを使用してください。

6. **画像エンベディングは直接API呼び出しが必要**: LangChainGo の `Embedder` はテキストのみ対応です。画像を生で埋め込むには、CLIP、Geminiマルチモーダル、Cohere v4 などのAPIを直接呼び出してください。

---

## 関連ドキュメント

- [Embeddings & pgvector](/ja/guides/embeddings/) — 現在のエンベディング実装と運用上の制約
- [LangGraph Go](/ja/guides/langgraphgo/) — グラフオーケストレーションパターン
