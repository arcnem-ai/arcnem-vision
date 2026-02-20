---
title: LangGraph Go
description: Graph execution engine for orchestrating agent workflows — building graphs, parallel execution, checkpointing, and human-in-the-loop.
---

How `github.com/smallnest/langgraphgo` (v0.8.5) fits into the arcnem-vision Go services — the graph execution engine that orchestrates agent workflows for document processing.

Requires Go 1.25+. Depends on `github.com/tmc/langchaingo` for LLM and tool interfaces (see the [LangChain Go guide](/guides/langchaingo/)).

## Where It Fits

| Service | What langgraphgo does there |
|---------|----------------------------|
| `models/agents` | Builds and executes agent workflow graphs loaded from the database. Inngest triggers the job; langgraphgo runs the graph. |
| Future | Streaming execution results back to clients. Multi-agent supervisor patterns. Human-in-the-loop approval flows. |

**What langgraphgo does NOT cover**: Event scheduling and durable execution (that's Inngest), LLM calls and tool interfaces (that's langchaingo), or database access (that's GORM).

---

## Core Concepts

LangGraphGo models workflows as directed graphs where **state** flows through **nodes** connected by **edges**.

```
START ──> [node_a] ──> [node_b] ──?──> [node_c] ──> END
                                  └──> [node_d] ──> END
```

| Concept | What it is |
|---------|-----------|
| **StateGraph[S]** | The graph definition. `S` is your state type (struct or `map[string]any`). |
| **Node** | A function `func(ctx, state S) (S, error)` that transforms state. |
| **Edge** | A static connection from one node to another. |
| **Conditional Edge** | A dynamic connection where a function inspects state and returns the next node name. |
| **END** | Special constant (`graph.END`). An edge to END terminates the graph. |
| **StateRunnable[S]** | The compiled graph. Call `.Invoke(ctx, state)` to execute. |

---

## Building Graphs

### Typed State (Recommended)

```go
type ProcessingState struct {
    ObjectKey   string    `json:"object_key"`
    Description string    `json:"description"`
    Embedding   []float32 `json:"embedding"`
    DocumentID  string    `json:"document_id"`
}

g := graph.NewStateGraph[ProcessingState]()

g.AddNode("describe", "Generate image description", func(ctx context.Context, state ProcessingState) (ProcessingState, error) {
    description, err := describeImage(ctx, state.ObjectKey)
    if err != nil {
        return state, err
    }
    state.Description = description
    return state, nil
})

g.AddNode("embed", "Create embedding", func(ctx context.Context, state ProcessingState) (ProcessingState, error) {
    vec, err := embedder.EmbedQuery(ctx, state.Description)
    if err != nil {
        return state, err
    }
    state.Embedding = vec
    return state, nil
})

g.SetEntryPoint("describe")
g.AddEdge("describe", "embed")
g.AddEdge("embed", graph.END)

runnable, _ := g.Compile()
result, _ := runnable.Invoke(ctx, ProcessingState{
    ObjectKey:  "uploads/abc123.jpg",
    DocumentID: "doc-uuid",
})
```

---

## Conditional Routing

Conditional edges let the graph branch based on state.

```go
g.AddConditionalEdge("classify", func(ctx context.Context, state ProcessingState) string {
    if state.DocType == "image" {
        return "process_image"
    }
    return "process_text"
})
```

---

## Parallel Execution

When multiple edges fan out from a single node, the targets run in parallel automatically.

```go
// Fan-out: both "ocr" and "caption" run concurrently after "load"
g.AddEdge("load", "ocr")
g.AddEdge("load", "caption")

// Fan-in: both converge to "combine"
g.AddEdge("ocr", "combine")
g.AddEdge("caption", "combine")
```

When nodes run in parallel and both modify state, the last result wins by default. Use a **state merger** or **schema with reducers** for smarter merging.

---

## State Schemas and Reducers

Schemas define how node outputs merge into the running state.

Built-in reducers:

| Reducer | Behavior |
|---------|----------|
| `graph.OverwriteReducer` | New value replaces old (default) |
| `graph.AppendReducer` | Appends to slice |
| `graph.AddMessages` | Appends messages with ID-based upsert |

---

## Error Handling

### Retry Policy

```go
g.SetRetryPolicy(&graph.RetryPolicy{
    MaxRetries:      3,
    BackoffStrategy: graph.ExponentialBackoff,
    RetryableErrors: []string{"timeout", "rate limit", "503"},
})
```

### Per-Node Retry

```go
g.AddNodeWithRetry("call_api", "Call external API", callApiFn, &graph.RetryConfig{
    MaxAttempts:   5,
    InitialDelay:  200 * time.Millisecond,
    MaxDelay:      10 * time.Second,
    BackoffFactor: 2.0,
})
```

### Circuit Breaker

```go
g.AddNodeWithCircuitBreaker("external_api", "Call external API", callExternalFn, graph.CircuitBreakerConfig{
    FailureThreshold: 5,
    SuccessThreshold: 2,
    Timeout:          30 * time.Second,
})
```

---

## Human-in-the-Loop (Interrupts)

Pause graph execution at specific nodes for human approval.

```go
config := &graph.Config{
    InterruptBefore: []string{"dangerous_action"},
}

state, err := runnable.InvokeWithConfig(ctx, initialState, config)
if gi, ok := err.(*graph.GraphInterrupt); ok {
    // Show state to user for approval, then resume
    resumeConfig := &graph.Config{
        ResumeFrom: []string{gi.Node},
    }
    finalState, err := runnable.InvokeWithConfig(ctx, state, resumeConfig)
}
```

---

## Checkpointing

Save and resume graph execution across process restarts.

```go
g := graph.NewCheckpointableStateGraph[map[string]any]()
g.SetCheckpointConfig(graph.CheckpointConfig{
    Store:          graph.NewMemoryCheckpointStore(),
    AutoSave:       true,
    MaxCheckpoints: 20,
})
```

Available stores: Memory, File, Redis, PostgreSQL, SQLite.

---

## Pre-built Agent Patterns

| Agent | Constructor | When to use |
|-------|-------------|-------------|
| **ReAct** | `prebuilt.CreateReactAgentMap()` | Reason-Act loop with tools |
| **CreateAgent** | `prebuilt.CreateAgentMap()` | Configurable agent with system messages |
| **Supervisor** | `prebuilt.CreateSupervisorMap()` | Multi-agent orchestration |
| **ChatAgent** | `prebuilt.CreateChatAgent()` | Multi-turn conversation |
| **ReflectionAgent** | `prebuilt.CreateReflectionAgent()` | Self-improving output |
| **PlanningAgent** | `prebuilt.CreatePlanningAgent()` | Plan-then-execute workflows |

---

## MCP Tool Integration

LangGraphGo has a built-in adapter to convert MCP tools into langchaingo tools:

```go
import mcpadapter "github.com/smallnest/langgraphgo/adapter/mcp"

client, err := mcpadapter.NewClientFromConfig(ctx, "./mcp-config.json")
mcpTools, err := mcpadapter.MCPToTools(ctx, client)
agent, _ := prebuilt.CreateAgentMap(model, mcpTools, 20)
```

---

## Schema-Driven Graphs

Our architecture is unique: **agent graphs are defined in the database, not in code**. The DB schema (`agent_graphs`, `agent_graph_nodes`, `agent_graph_edges`) stores the graph structure. At runtime, we load a `Snapshot` and build a langgraphgo `StateGraph` from it.

```go
func BuildGraph(snapshot *Snapshot, factory NodeFuncFactory) (*StateGraph, error) {
    g := graphlib.NewStateGraph[map[string]any]()

    for _, snapshotNode := range snapshot.Nodes {
        nodeFn, err := factory(snapshotNode)
        g.AddNode(nodeKey, snapshotNode.Node.NodeType, nodeFn)
    }

    g.SetEntryPoint(snapshot.AgentGraph.EntryNode)

    for _, edge := range snapshot.Edges {
        g.AddEdge(edge.FromNode, edge.ToNode)
    }

    return g, nil
}
```

---

## When to Use What

| Pattern | When to use | Arcnem Vision example |
|---------|-------------|----------------------|
| **Basic StateGraph** | Fixed, simple pipeline | Describe → embed → store |
| **Conditional edges** | Branch based on content | Route by document type |
| **Parallel execution** | Independent steps | OCR + caption generation |
| **Checkpointing** | Long-running or crash-sensitive | Multi-step document processing |
| **Streaming** | Real-time progress updates | Processing status to client |
| **Interrupts** | Human approval needed | Low-confidence classifications |
| **ReAct agent** | Open-ended tool use | "Find similar images and explain why" |
| **Supervisor** | Multi-agent coordination | Image processor + search agent |
| **Schema-driven (DB)** | Per-device configurable workflows | Different graphs per device |

---

## Gotchas

1. **`map[string]any` requires type assertions everywhere.** Prefer typed state for new graphs.
2. **Parallel node state merging.** Without a schema or merger, the last-finishing parallel node's output overwrites everything.
3. **Conditional edges replace static edges.** Don't mix both from the same source node.
4. **`graph.END` is the string `"END"`.** Don't name a node "END".
5. **Compilation is cheap.** You can compile per-request if the graph is built dynamically.
6. **Node functions must be goroutine-safe** when using parallel execution.
7. **Inngest steps vs langgraphgo nodes are different layers.** Don't confuse the two retry mechanisms.

---

## Related Docs

- [LangChain Go](/guides/langchaingo/) — LLM providers, embeddings, tools, chains, agents
- [Embeddings & pgvector](/guides/embeddings/) — Current embedding implementation and operational constraints
