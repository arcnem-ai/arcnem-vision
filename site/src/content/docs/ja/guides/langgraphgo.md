---
title: LangGraph Go
description: グラフ実行エンジン — ワークフローの構築、並列実行、チェックポイント、ヒューマンインザループ。
---

`github.com/smallnest/langgraphgo`（v0.8.5）が arcnem-vision の Go サービスにどう適用されるかを解説します。ドキュメント処理向けエージェントワークフローをオーケストレーションするグラフ実行エンジンです。

Go 1.25+ が必要です。LLMおよびツールインターフェースには `github.com/tmc/langchaingo` を利用します（詳細は [LangChain Go ガイド](/ja/guides/langchaingo/) を参照）。

## どこで使われるか

| サービス | そのサービスでの langgraphgo の役割 |
|---------|----------------------------|
| `models/agents` | DBから読み込んだエージェントワークフローグラフを構築・実行。Inngestがジョブを起動し、langgraphgoがグラフを実行。 |
| 将来 | 実行結果のクライアントへのストリーミング、マルチエージェントのスーパーバイザーパターン、ヒューマンインザループ承認フロー。 |

**langgraphgo がカバーしないもの**: イベントスケジューリングと耐久実行（Inngestの担当）、LLM呼び出しとツールインターフェース（langchaingoの担当）、データベースアクセス（GORMの担当）。

---

## コアコンセプト

LangGraphGo はワークフローを有向グラフとしてモデル化し、**state** が **node** を **edge** でつながれながら流れます。

```
START ──> [node_a] ──> [node_b] ──?──> [node_c] ──> END
                                  └──> [node_d] ──> END
```

| 概念 | 説明 |
|---------|-----------|
| **StateGraph[S]** | グラフ定義。`S` は状態型（構造体または `map[string]any`）。 |
| **Node** | 状態を変換する関数 `func(ctx, state S) (S, error)`。 |
| **Edge** | ノード間の静的接続。 |
| **Conditional Edge** | 状態を見て次ノード名を返す動的接続。 |
| **END** | 特殊定数（`graph.END`）。ENDへのエッジはグラフを終了。 |
| **StateRunnable[S]** | コンパイル済みグラフ。`.Invoke(ctx, state)` で実行。 |

---

## グラフ構築

### 型付きState（推奨）

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

## 条件分岐ルーティング

Conditional edge を使うと、state に基づいてグラフを分岐できます。

```go
g.AddConditionalEdge("classify", func(ctx context.Context, state ProcessingState) string {
    if state.DocType == "image" {
        return "process_image"
    }
    return "process_text"
})
```

---

## 並列実行

1つのノードから複数エッジが分岐すると、分岐先は自動で並列実行されます。

```go
// Fan-out: "load" の後に "ocr" と "caption" を同時実行
g.AddEdge("load", "ocr")
g.AddEdge("load", "caption")

// Fan-in: 両方を "combine" に集約
g.AddEdge("ocr", "combine")
g.AddEdge("caption", "combine")
```

並列ノードが同じstateを更新する場合、デフォルトでは最後に完了した結果が勝ちます。より賢く統合するには **state merger** または **reducer付きschema** を使います。

---

## StateスキーマとReducer

スキーマは、ノード出力を実行中stateへどうマージするかを定義します。

組み込みReducer:

| Reducer | 挙動 |
|---------|----------|
| `graph.OverwriteReducer` | 新しい値で置き換える（デフォルト） |
| `graph.AppendReducer` | スライスへ追記 |
| `graph.AddMessages` | IDベースupsertでメッセージ追記 |

---

## エラーハンドリング

### リトライポリシー

```go
g.SetRetryPolicy(&graph.RetryPolicy{
    MaxRetries:      3,
    BackoffStrategy: graph.ExponentialBackoff,
    RetryableErrors: []string{"timeout", "rate limit", "503"},
})
```

### ノード単位リトライ

```go
g.AddNodeWithRetry("call_api", "Call external API", callApiFn, &graph.RetryConfig{
    MaxAttempts:   5,
    InitialDelay:  200 * time.Millisecond,
    MaxDelay:      10 * time.Second,
    BackoffFactor: 2.0,
})
```

### サーキットブレーカー

```go
g.AddNodeWithCircuitBreaker("external_api", "Call external API", callExternalFn, graph.CircuitBreakerConfig{
    FailureThreshold: 5,
    SuccessThreshold: 2,
    Timeout:          30 * time.Second,
})
```

---

## Human-in-the-Loop（割り込み）

特定ノードでグラフ実行を一時停止し、人間の承認を挟めます。

```go
config := &graph.Config{
    InterruptBefore: []string{"dangerous_action"},
}

state, err := runnable.InvokeWithConfig(ctx, initialState, config)
if gi, ok := err.(*graph.GraphInterrupt); ok {
    // stateをユーザーに提示して承認後に再開
    resumeConfig := &graph.Config{
        ResumeFrom: []string{gi.Node},
    }
    finalState, err := runnable.InvokeWithConfig(ctx, state, resumeConfig)
}
```

---

## チェックポイント

プロセス再起動をまたいで、グラフ実行を保存・再開できます。

```go
g := graph.NewCheckpointableStateGraph[map[string]any]()
g.SetCheckpointConfig(graph.CheckpointConfig{
    Store:          graph.NewMemoryCheckpointStore(),
    AutoSave:       true,
    MaxCheckpoints: 20,
})
```

利用可能なストア: Memory、File、Redis、PostgreSQL、SQLite。

---

## 事前構築済みエージェントパターン

| エージェント | コンストラクタ | 使いどころ |
|-------|-------------|-------------|
| **ReAct** | `prebuilt.CreateReactAgentMap()` | ツール利用を伴う Reason-Act ループ |
| **CreateAgent** | `prebuilt.CreateAgentMap()` | system message を含む設定可能エージェント |
| **Supervisor** | `prebuilt.CreateSupervisorMap()` | マルチエージェントオーケストレーション |
| **ChatAgent** | `prebuilt.CreateChatAgent()` | マルチターン会話 |
| **ReflectionAgent** | `prebuilt.CreateReflectionAgent()` | 出力の自己改善 |
| **PlanningAgent** | `prebuilt.CreatePlanningAgent()` | Plan-then-execute ワークフロー |

---

## MCPツール統合

LangGraphGoには、MCPツールをlangchaingoツールへ変換する組み込みアダプターがあります。

```go
import mcpadapter "github.com/smallnest/langgraphgo/adapter/mcp"

client, err := mcpadapter.NewClientFromConfig(ctx, "./mcp-config.json")
mcpTools, err := mcpadapter.MCPToTools(ctx, client)
agent, _ := prebuilt.CreateAgentMap(model, mcpTools, 20)
```

---

## スキーマ駆動グラフ

このアーキテクチャの特徴は、**エージェントグラフをコードではなくデータベースで定義する** 点です。DBスキーマ（`agent_graphs`、`agent_graph_nodes`、`agent_graph_edges`）がグラフ構造を保持し、実行時に `Snapshot` を読み込んで langgraphgo の `StateGraph` を構築します。

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

## 使い分け

| パターン | 使う場面 | Arcnem Visionでの例 |
|---------|-------------|----------------------|
| **Basic StateGraph** | 固定で単純なパイプライン | 説明生成 → 埋め込み → 保存 |
| **Conditional edges** | コンテンツに応じた分岐 | ドキュメント種別でルーティング |
| **Parallel execution** | 独立ステップを同時実行 | OCR + キャプション生成 |
| **Checkpointing** | 長時間実行やクラッシュ耐性が必要 | 多段ドキュメント処理 |
| **Streaming** | リアルタイム進捗を返したい | 処理ステータスをクライアントへ配信 |
| **Interrupts** | 人の承認が必要 | 低信頼度分類の確認 |
| **ReAct agent** | オープンエンドなツール利用 | 「似た画像を探して理由を説明して」 |
| **Supervisor** | マルチエージェント連携 | 画像処理エージェント + 検索エージェント |
| **Schema-driven (DB)** | デバイスごとにワークフロー可変 | デバイス別グラフ切り替え |

---

## 注意点

1. **`map[string]any` は型アサーションが多発する**: 新規グラフでは型付きstateを推奨。
2. **並列ノードのstateマージ**: schemaやmergerがないと、最後に完了した並列ノードの出力が他を上書きします。
3. **Conditional edgeは静的edgeを置き換える**: 同じ始点ノードから両方を混在させないでください。
4. **`graph.END` は文字列 `"END"`**: ノード名に `END` を使わないでください。
5. **コンパイルは軽量**: 動的構築グラフではリクエストごとにcompileしても問題ありません。
6. **並列実行時はノード関数をgoroutine-safeにする** 必要があります。
7. **Inngestのstepとlanggraphgoのnodeは別レイヤー**: リトライ機構を混同しないでください。

---

## 関連ドキュメント

- [LangChain Go](/ja/guides/langchaingo/) — LLMプロバイダー、エンベディング、ツール、チェーン、エージェント
- [Embeddings & pgvector](/ja/guides/embeddings/) — 現在のエンベディング実装と運用上の制約
