# LangChain Go in Arcnem Vision

How `github.com/tmc/langchaingo` (v0.1.14) fits into the arcnem-vision Go services -- focused on text embeddings, agents, chains, tools, and the MCP bridge.

Requires Go 1.25+.

## Where It Fits

| Service | What langchaingo does there |
|---------|----------------------------|
| `models/agents` | Inngest jobs use text embedders + chains for the processing pipeline |
| `models/mcp` | MCP tool handlers share the same underlying logic as agent tools |
| Future agent service | Autonomous agent with tools for embed, search, describe, ask |

`models/agents/go.mod` already depends on `github.com/tmc/langchaingo v0.1.14`.

**What langchaingo does NOT cover**: Image embeddings. The `Embedder` interface is text-only (`EmbedDocuments([]string)` / `EmbedQuery(string)`). For embedding images directly (CLIP, Gemini multimodal, Cohere v4), you need direct API calls or a multimodal SDK -- see [`docs/embeddings.md`](embeddings.md).

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

For agents that need tool calling, use OpenAI or Anthropic -- they support native function calling. Ollama and Google AI work with prompt-based agents (`OneShotAgent`).

For text embeddings, use OpenAI, Google AI, Ollama, Mistral, Cohere, or a dedicated embedder (Jina, Voyage AI). Anthropic has no embedding API.

---

## Text Embeddings

LangChainGo handles text embedding generation. This is used for embedding OCR text, captions, descriptions, and user queries.

For implementation details and schema constraints, see [`docs/embeddings.md`](embeddings.md).

### Interface

```go
// What you call
type Embedder interface {
    EmbedDocuments(ctx context.Context, texts []string) ([][]float32, error)
    EmbedQuery(ctx context.Context, text string) ([]float32, error)
}

// What LLM providers implement (used internally by NewEmbedder)
type EmbedderClient interface {
    CreateEmbedding(ctx context.Context, texts []string) ([][]float32, error)
}
```

### Creating an Embedder

LLM providers that implement `EmbedderClient` can be wrapped with `embeddings.NewEmbedder()`:

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

// Mistral
llm, _ := mistral.New()
embedder, _ := embeddings.NewEmbedder(llm)
```

Dedicated embedding packages (no LLM wrapper needed):

```go
import (
    "github.com/tmc/langchaingo/embeddings/jina"
    "github.com/tmc/langchaingo/embeddings/voyageai"
)

// Jina
embedder, _ := jina.NewJina()

// Voyage AI
embedder, _ := voyageai.NewVoyageAI()
```

Also available: `embeddings/bedrock` (Amazon Titan/Cohere via AWS), `embeddings/huggingface`, `embeddings/cybertron` (local Go-native transformers).

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

For the pgvector Go type: `go get github.com/pgvector/pgvector-go`

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

The agent sends a JSON string as `input`. The tool returns a string result.

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

### Custom Tool Example: Create Text Embedding

```go
type CreateEmbeddingTool struct {
    embedder embeddings.Embedder
    db       *gorm.DB
}

func (t *CreateEmbeddingTool) Name() string {
    return "create_document_embedding"
}

func (t *CreateEmbeddingTool) Description() string {
    return "Generate a text embedding for a document description. Input: JSON with 'document_id' and 'text' fields."
}

func (t *CreateEmbeddingTool) Call(ctx context.Context, input string) (string, error) {
    var req struct {
        DocumentID string `json:"document_id"`
        Text       string `json:"text"`
    }
    if err := json.Unmarshal([]byte(input), &req); err != nil {
        return "", err
    }

    vec, err := t.embedder.EmbedQuery(ctx, req.Text)
    if err != nil {
        return "", err
    }

    t.db.Exec(`
        INSERT INTO document_description_embeddings
          (document_description_id, model_id, dim, embedding)
        VALUES ($1, $2, $3, $4)
    `, req.DocumentID, modelID, len(vec), pgvector.NewVector(vec))

    return fmt.Sprintf("Created %d-dim embedding for document %s", len(vec), req.DocumentID), nil
}
```

### Built-in Tools

LangChainGo ships with several tools out of the box:

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

`OpenAIFunctionsAgent` is preferred when the LLM supports tool calling natively -- it's more reliable than prompt-based tool selection.

### Creating and Running an Agent

```go
agentTools := []tools.Tool{
    &FindSimilarDocsTool{embedder: embedder, db: db},
    &CreateEmbeddingTool{embedder: embedder, db: db},
}

// Option A: OpenAI functions agent (preferred for OpenAI/Anthropic)
agent := agents.NewOpenAIFunctionsAgent(llm, agentTools)

// Option B: OneShotAgent (works with any LLM)
agent := agents.NewOneShotAgent(llm, agentTools,
    agents.WithMaxIterations(5),
)

// Run through an executor
executor := agents.NewExecutor(agent)

result, err := chains.Run(ctx, executor,
    "Find documents similar to 'sunset over the ocean' and return the top 3")
```

The agent will:
1. Parse the request
2. Decide to call `find_similar_documents` with `{"query": "sunset over the ocean", "limit": 3}`
3. Get results back
4. Format a human-readable answer

### Direct Function Calling (No Agent)

For cases where you don't need the agent's reasoning loop -- you know exactly which tool to call and just want the LLM to extract parameters:

```go
toolDefs := []llms.Tool{
    {
        Type: "function",
        Function: &llms.FunctionDefinition{
            Name:        "find_similar_documents",
            Description: "Find similar documents by text query",
            Parameters: map[string]any{
                "type": "object",
                "properties": map[string]any{
                    "query": map[string]any{"type": "string"},
                    "limit": map[string]any{"type": "integer"},
                },
                "required": []string{"query"},
            },
        },
    },
}

resp, err := llm.GenerateContent(ctx,
    []llms.MessageContent{
        {Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{
            llms.TextContent{Text: "Find me images like a sunset over water"},
        }},
    },
    llms.WithTools(toolDefs),
)
// resp.Choices[0].ToolCalls contains the structured call
```

---

## Chains

Chains compose LLM calls into reusable pipelines. Unlike agents, chains follow a fixed path.

### RetrievalQA (RAG)

The primary pattern for "ask a question, get an answer from our documents":

```go
// Wrap a vector store as a retriever
retriever := vectorstores.ToRetriever(store, 5,
    vectorstores.WithScoreThreshold(0.7),
)

// Build the chain: retrieve docs -> stuff into prompt -> ask LLM
qaChain := chains.NewRetrievalQAFromLLM(llm, retriever)
answer, err := chains.Run(ctx, qaChain, "What images contain circuit boards?")
```

This is the `arcnem ask` flow -- retrieve relevant document descriptions from pgvector, then have the LLM synthesize an answer with citations.

**Note**: `NewRetrievalQAFromLLM` is the convenience constructor. The lower-level `NewRetrievalQA` takes a `Chain` (combine-documents chain) and a `schema.Retriever` if you need more control.

### StuffDocuments QA

When you already have documents in hand (e.g., from a manual search):

```go
docs := []schema.Document{
    {PageContent: "OCR text from document A...", Metadata: map[string]any{"id": "doc-a"}},
    {PageContent: "Caption from document B...", Metadata: map[string]any{"id": "doc-b"}},
}

stuffQAChain := chains.LoadStuffQA(llm)
answer, err := chains.Run(ctx, stuffQAChain, map[string]any{
    "input_documents": docs,
    "question":        "What do these images have in common?",
})
```

### MapReduce Documents

For large document sets that won't fit in a single prompt:

```go
mapReduceChain := chains.LoadMapReduceQA(llm)
answer, err := chains.Run(ctx, mapReduceChain, map[string]any{
    "input_documents": docs,
    "question":        "Summarize these images",
})
```

Processes each document individually (map step), then combines the summaries (reduce step).

### Conversation Chain (Memory)

For multi-turn chat with context:

```go
conversationMemory := memory.NewConversationBuffer()
chain := chains.NewConversation(llm, conversationMemory)

r1, _ := chains.Run(ctx, chain, "Find images of cats")
r2, _ := chains.Run(ctx, chain, "Now filter those to only outdoor scenes")
// r2 remembers the cat context from r1
```

### Sequential Chain

Pipe output of one chain into the next:

```go
seqChain, err := chains.NewSequentialChain(
    []chains.Chain{describeChain, embedChain, searchChain},
    []string{"input"},           // input keys
    []string{"search_results"},  // output keys
)
result, err := chains.Run(ctx, seqChain, "a photo of a sunset")
```

### Summarization

Two strategies for summarizing documents:

```go
// Stuff: concatenate all docs into one prompt (small doc sets)
stuffSummary := chains.LoadStuffSummarization(llm)

// Refine: iteratively refine a summary with each doc (large doc sets)
refineSummary := chains.LoadRefineSummarization(llm)
```

### When to Use Chains vs Agents

| Use chains when... | Use agents when... |
|--------------------|--------------------|
| The pipeline is fixed and predictable | The LLM needs to decide what to do |
| `arcnem ask` -- always retrieve then answer | "Create an embedding for this, then find similar ones" |
| Performance matters (fewer LLM calls) | The task is open-ended |
| You don't need tool selection logic | Multiple tools, LLM picks which ones |

---

## Bridging MCP Tools and LangChain Agents

The MCP server (`models/mcp`) uses `github.com/modelcontextprotocol/go-sdk`. LangChain agents use the `tools.Tool` interface. There is no built-in MCP support in langchaingo. Three ways to bridge them:

### Option 1: Shared Logic (Recommended)

Write core logic as standalone functions. Both MCP handlers and langchaingo tools call the same code:

```
models/
  shared/
    embedding/
      create.go        // GenerateEmbedding(ctx, text) -> []float32
      search.go         // FindSimilar(ctx, query, limit) -> []Result
  mcp/
    tools/
      create_document_embedding.go   // MCP handler -> calls shared/embedding.GenerateEmbedding
      find_similar_documents.go      // MCP handler -> calls shared/embedding.FindSimilar
  agents/
    tools/
      create_embedding_tool.go       // tools.Tool -> calls shared/embedding.GenerateEmbedding
      find_similar_tool.go           // tools.Tool -> calls shared/embedding.FindSimilar
```

No network hop. No dependency conflicts. Both surfaces get the same behavior.

### Option 2: Community MCP Adapter

```bash
go get github.com/i2y/langchaingo-mcp-adapter
go get github.com/mark3labs/mcp-go
```

```go
mcpClient, _ := client.NewStdioMCPClient("./mcp-server-binary", nil)
bridge, _ := adapter.New(mcpClient)
mcpTools, _ := bridge.Tools() // []tools.Tool

agent := agents.NewOneShotAgent(llm, mcpTools)
```

Caveat: Uses `mark3labs/mcp-go`, not the official SDK we already use. Adds a dependency and requires the MCP server running as a separate process.

### Option 3: Write Your Own Adapter

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

## How It All Maps to Arcnem Vision

### The `arcnem ask` Flow (Chain)

```
User: "What images show circuit boards?"
  │
  ├── embedder.EmbedQuery(ctx, query) → queryVec
  ├── pgvector similarity search → top 5 document descriptions
  ├── chains.NewRetrievalQAFromLLM(llm, retriever)
  └── LLM answers with cited evidence
```

This is a fixed pipeline -- use a **RetrievalQA chain**.

### The `arcnem retrieve` Flow (Direct)

```
User: "find images of sunsets"
  │
  ├── embedder.EmbedQuery(ctx, query) → queryVec
  └── pgvector similarity search → ranked results
```

No LLM needed for the answer. Just embedding + SQL.

### MCP Tool Invocation (Claude)

```
Claude: "I need to find documents similar to X"
  │
  ├── Calls MCP tool: find_similar_documents({query: "X", limit: 5})
  ├── MCP handler → shared/embedding.FindSimilar(ctx, "X", 5)
  └── Returns results to Claude
```

### Autonomous Agent (Future)

```
User: "Process this image and find me similar ones"
  │
  ├── Agent reasons: "I need to create an embedding first"
  ├── Calls create_document_embedding tool
  ├── Agent reasons: "Now I can search for similar docs"
  ├── Calls find_similar_documents tool
  └── Agent formats final answer
```

This is open-ended -- use an **agent with tools**.

---

## Gotchas

1. **Dimension mismatch**: Embeddings are stored as variable-length vectors with an `embedding_dim` check. Ensure generated embedding length matches `embedding_dim`, and query/filter against the same dimension (currently indexed for 768 and 1536).

2. **langchaingo pgvector store vs custom schema**: The `vectorstores/pgvector` package creates its own tables. We have custom tables with foreign keys to `documents` and `models`. Use langchaingo only for embedding generation; write your own SQL for storage and retrieval.

3. **MCP SDK mismatch**: The community adapter uses `mark3labs/mcp-go`. We use the official `modelcontextprotocol/go-sdk`. Prefer the shared-logic approach to avoid dependency conflicts.

4. **Separate go.mod per service**: `models/agents`, `models/mcp`, `models/db` each have their own module. Share code via `models/shared`.

5. **Anthropic has no embeddings**: Claude can't generate embeddings. Use OpenAI, Google, Ollama, Mistral, Jina, or Voyage AI for that, even if your agent LLM is Claude.

6. **Image embeddings need direct API calls**: LangChainGo's `Embedder` only handles text. For embedding raw images, use direct API calls to CLIP, Gemini multimodal, Cohere v4, etc.

7. **Deprecated APIs in v0.1.14**: `llms.LLM` type is deprecated (use `llms.Model`). `Model.Call()` is deprecated (use `GenerateContent` or `GenerateFromSinglePrompt`). `agents.Initialize()` is deprecated (use `NewOneShotAgent`/`NewOpenAIFunctionsAgent`/`NewConversationalAgent` + `NewExecutor`).

---

## Related Docs

- [`docs/embeddings.md`](embeddings.md) -- Current embedding implementation and operational constraints
