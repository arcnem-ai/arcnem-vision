---
title: LangChain Go
description: How langchaingo fits into the Go services — text embeddings, agents, chains, tools, and the MCP bridge.
---

How `github.com/tmc/langchaingo` (v0.1.14) fits into the arcnem-vision Go services — focused on text embeddings, agents, chains, tools, and the MCP bridge.

Requires Go 1.25+.

## Where It Fits

| Service | What langchaingo does there |
|---------|----------------------------|
| `models/agents` | Inngest jobs use text embedders + chains for the processing pipeline |
| `models/mcp` | MCP tool handlers share the same underlying logic as agent tools |
| Future agent service | Autonomous agent with tools for embed, search, describe, ask |

**What langchaingo does NOT cover**: Image embeddings. The `Embedder` interface is text-only (`EmbedDocuments([]string)` / `EmbedQuery(string)`). For embedding images directly (CLIP, Gemini multimodal, Cohere v4), you need direct API calls or a multimodal SDK — see the [Embeddings guide](/guides/embeddings/).

---

## Installation

```bash
go get github.com/tmc/langchaingo@v0.1.14
```

Key imports:

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

## LLM Providers

Every provider implements `llms.Model`. Pick based on use case.

```go
// OpenAI (OPENAI_API_KEY env var)
llm, err := openai.New(openai.WithModel("gpt-4.1-mini"))

// Anthropic (ANTHROPIC_API_KEY env var)
llm, err := anthropic.New(anthropic.WithModel("claude-sonnet-4-5-20250929"))

// Google AI (GOOGLE_API_KEY env var)
llm, err := googleai.New(ctx, googleai.WithDefaultModel("gemini-2.0-flash"))

// Ollama (local, no key)
llm, err := ollama.New(ollama.WithModel("llama3"))
```

For agents that need tool calling, use OpenAI or Anthropic — they support native function calling. Ollama and Google AI work with prompt-based agents (`OneShotAgent`).

---

## Text Embeddings

LangChainGo handles text embedding generation. For implementation details and schema constraints, see the [Embeddings guide](/guides/embeddings/).

### Interface

```go
type Embedder interface {
    EmbedDocuments(ctx context.Context, texts []string) ([][]float32, error)
    EmbedQuery(ctx context.Context, text string) ([]float32, error)
}
```

### Creating an Embedder

```go
// OpenAI (default: text-embedding-ada-002)
llm, _ := openai.New()
embedder, _ := embeddings.NewEmbedder(llm, embeddings.WithBatchSize(100))

// Google AI (default: text-embedding-005 as of v0.1.14)
llm, _ := googleai.New(ctx)
embedder, _ := embeddings.NewEmbedder(llm)

// Ollama (local)
llm, _ := ollama.New(ollama.WithModel("nomic-embed-text"))
embedder, _ := embeddings.NewEmbedder(llm)
```

### Storing in Our Custom Schema

The langchaingo `vectorstores/pgvector` package creates its own tables. We have custom tables with foreign keys to `documents` and `models`, so use langchaingo for generation only and write your own SQL:

```go
// Generate
vec, err := embedder.EmbedQuery(ctx, captionText)

// Store (GORM)
db.Exec(`
    INSERT INTO document_description_embeddings
      (document_description_id, model_id, dim, embedding)
    VALUES ($1, $2, $3, $4)
`, descriptionID, modelID, len(vec), pgvector.NewVector(vec))

// Search
db.Raw(`
    SELECT de.document_id, de.embedding <=> $1::vector AS distance
    FROM document_embeddings de
    ORDER BY distance LIMIT $2
`, pgvector.NewVector(queryVec), limit).Scan(&results)
```

---

## Tools

### The Interface

Every tool a langchaingo agent can use must implement:

```go
type Tool interface {
    Name() string
    Description() string
    Call(ctx context.Context, input string) (string, error)
}
```

### Custom Tool Example: Find Similar Documents

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

### Built-in Tools

| Package | Tool | Notes |
|---------|------|-------|
| `tools/calculator` | Calculator | Arithmetic evaluation |
| `tools/serpapi` | SerpAPI | Web search (needs `SERPAPI_API_KEY`) |
| `tools/duckduckgo` | DuckDuckGo | Web search, no API key needed |
| `tools/wikipedia` | Wikipedia | Wikipedia search |
| `tools/scraper` | Scraper | Web page scraping |
| `tools/sqldatabase` | SQL Database | Query a SQL database |

---

## Agents

Agents decide which tools to call based on the user's input. They loop: reason -> pick tool -> call tool -> reason again -> answer.

### Agent Types

| Type | Constructor | When to use |
|------|-------------|-------------|
| `OpenAIFunctionsAgent` | `agents.NewOpenAIFunctionsAgent(llm, tools)` | Models with native tool calling (OpenAI, Anthropic). Most reliable. |
| `OneShotAgent` | `agents.NewOneShotAgent(llm, tools)` | Any LLM. ReAct-style prompting. |
| `ConversationalAgent` | `agents.NewConversationalAgent(llm, tools)` | Any LLM. ReAct-style with chat history support. |

### Creating and Running an Agent

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

## Chains

Chains compose LLM calls into reusable pipelines. Unlike agents, chains follow a fixed path.

### RetrievalQA (RAG)

```go
retriever := vectorstores.ToRetriever(store, 5,
    vectorstores.WithScoreThreshold(0.7),
)

qaChain := chains.NewRetrievalQAFromLLM(llm, retriever)
answer, err := chains.Run(ctx, qaChain, "What images contain circuit boards?")
```

### When to Use Chains vs Agents

| Use chains when... | Use agents when... |
|--------------------|--------------------|
| The pipeline is fixed and predictable | The LLM needs to decide what to do |
| Performance matters (fewer LLM calls) | The task is open-ended |
| You don't need tool selection logic | Multiple tools, LLM picks which ones |

---

## Bridging MCP Tools and LangChain Agents

The MCP server uses `github.com/modelcontextprotocol/go-sdk`. LangChain agents use the `tools.Tool` interface. Three ways to bridge them:

### Option 1: Shared Logic (Recommended)

Write core logic as standalone functions. Both MCP handlers and langchaingo tools call the same code:

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

No network hop. No dependency conflicts. Both surfaces get the same behavior.

### Option 2: Write Your Own Adapter

Wrap the official SDK client to satisfy `tools.Tool`:

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

## Gotchas

1. **Dimension mismatch**: Embeddings are stored as variable-length vectors with an `embedding_dim` check. Ensure generated embedding length matches `embedding_dim`, and query/filter against the same dimension (currently indexed for 768 and 1536).

2. **langchaingo pgvector store vs custom schema**: The `vectorstores/pgvector` package creates its own tables. We have custom tables with foreign keys. Use langchaingo only for embedding generation; write your own SQL.

3. **MCP SDK mismatch**: The community adapter uses `mark3labs/mcp-go`. We use the official `modelcontextprotocol/go-sdk`. Prefer the shared-logic approach.

4. **Separate go.mod per service**: `models/agents`, `models/mcp`, `models/db` each have their own module. Share code via `models/shared`.

5. **Anthropic has no embeddings**: Claude can't generate embeddings. Use OpenAI, Google, Ollama, or others for that.

6. **Image embeddings need direct API calls**: LangChainGo's `Embedder` only handles text. For embedding raw images, use direct API calls to CLIP, Gemini multimodal, Cohere v4, etc.

---

## Related Docs

- [Embeddings & pgvector](/guides/embeddings/) — Current embedding implementation and operational constraints
- [LangGraph Go](/guides/langgraphgo/) — Graph orchestration patterns
