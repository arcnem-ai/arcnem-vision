---
title: OAuth MCPでエージェントを接続する
description: MCPクライアントを接続し、OAuth権限の範囲内でワークフローの編集・実行とドキュメントの参照を行う方法。
---

Arcnem Vision の API サーバーは `/api/mcp` でリモート MCP を提供します。エージェントはグラフを読み、実験用に複製・編集し、プロジェクト内のドキュメントで実行して、結果をもとに改善できます。

## 接続する

1. クライアントに `https://api.example.com/api/mcp` をリモート Streamable HTTP MCP サーバーとして追加します。ホストは利用する環境の公開 API ホストに置き換えてください。ローカル開発では `http://localhost:3000/api/mcp` を使います。
2. ブラウザーでダッシュボードにログインし、要求された権限を確認します。
3. 接続を許可し、エージェントにプロジェクトやワークフローの一覧を取得させます。

![Codex と要求された権限を表示する OAuth 同意画面](/images/oauth-consent.jpg)

*表示例：アクセスを許可する前に、アプリケーションと要求された権限を確認します。*

クライアントには、PKCE を使う OAuth 認可コードフローと **Client ID Metadata Documents（CIMD）** の対応が必要です。Dynamic Client Registration を必須とするクライアントには対応していません。クライアントが認可サーバーを検出し、トークンを管理します。サービス API キーは [REST API](/ja/reference/api/) で使い、MCP では OAuth で認証します。

MCP クライアントの接続管理から OAuth トークンを失効させます。標準の失効エンドポイントは API ホストの `/api/auth/oauth2/revoke` です。更新トークンを失効させると、ひもづくアクセストークンも無効になり、以後の更新もできません。クライアント内で接続を削除するだけでは、クライアントが失効リクエストも送らない限り、保存済みトークンは失効または期限切れまで使用できます。ツール呼び出しのたびに、現在の組織メンバーシップも確認します。

## ツールと権限

| ツール | 用途 | OAuth スコープ |
| --- | --- | --- |
| `list_projects` | プロジェクトと所属組織を探す。 | `projects:read` |
| `list_workflows` | 組織のワークフローを一覧で取得する。 | `workflows:read` |
| `get_workflow` | 編集可能なグラフ定義とリビジョンを読む。 | `workflows:read` |
| `get_workflow_catalog` | モデル、処理ツール、ノード設定のスキーマを調べる。 | `workflows:read` |
| `create_workflow` | グラフを新規作成・複製する。 | `workflows:write` |
| `update_workflow` | 読み取ったリビジョンを指定し、グラフ全体を更新する。 | `workflows:write` |
| `execute_workflow` | プロジェクトのドキュメントでグラフを実行する。 | `workflows:execute` |
| `list_executions` | プロジェクトの過去の実行を探す。 | `workflows:read` |
| `get_execution` | 状態、出力、エラー、必要に応じて各ステップを読む。 | `workflows:read` |
| `list_documents` | プロジェクトのドキュメントを一覧で取得する。 | `documents:list` |
| `search_documents` | プロジェクト内で選択したドキュメントを検索する。 | `documents:search` |
| `get_document` | ドキュメントの詳細と抽出済みコンテンツを読む。 | `documents:read` |

継続接続には `offline_access` でトークン更新を要求できます。必要な権限だけを要求してください。スコープを許可しても、ユーザーが所属していない組織やプロジェクトにはアクセスできません。一覧にはページ分割があり、詳しい内容は個別の取得ツールで読みます。

## 実験を繰り返す

1. `list_projects`、`list_workflows`、`get_workflow_catalog` で対象と設定候補を確認します。`list_documents` や `search_documents` で検証用ドキュメントを選びます。
2. `get_workflow` の `definition` を新しい名前で `create_workflow` に渡し、複製したグラフを再取得します。複製には新しいグラフ ID とノード ID が付きます。
3. 定義を編集し、`workflowId` と `expectedRevision` を指定して `update_workflow` を呼びます。残すノードやエッジも含め、完全な定義を送ります。
4. `execute_workflow` で実行します。**新しい実験ごとに新しい冪等キーを使います。** 同じキーを再利用するのは、応答が不明だった同一リクエストを再送する場合だけです。
5. 完了まで状態を確認し、出力、エラー、各ステップを読んで、最新の定義から次の編集を始めます。

`expectedRevision` が古い場合、変更を保存せずにエラーを返します。最新の定義を読み直して編集を適用し、新しいリビジョンで再試行してください。

保存済みグラフの編集は、そのグラフを使う他のクライアントを含め、以後の実行に反映されます。受付済みの実行は、その時点のグラフのスナップショットを使います。実行結果のスナップショットハッシュで、編集前後の実行を区別できます。

### グラフの設定

`definition` には `name`、`description`、`entryNode`、`stateSchema`、`nodes`、`edges` が入ります。同じグラフを更新するときは既存ノード ID を維持してください。モデルやノード設定は `get_workflow_catalog` で確認できます。worker と supervisor はモデルを必要とし、tool ノードは処理ツールをちょうど 1 つ呼び出します。

`stateSchema` は状態キーごとの結合方法を指定するマップです。出力検証用の JSON Schema ではありません。例えば `{"messages":"append","review":"overwrite"}` と指定します。

ツールの `input_mapping` は引数名を状態キーに対応させます。文字列の定数は `_const:` を付け、例として `"provider":"_const:OPENAI"` と書きます。入れ子のオブジェクトや配列の文字列にも同じ規則が適用されます。`output_mapping` は結果フィールドを保存先の状態キーに対応させます。

## セルフホスト

更新した API の起動前にデータベースのマイグレーションを適用します。追加の MCP 専用サーバーは不要です。API 側で `BETTER_AUTH_BASE_URL` に公開 API オリジン、`DASHBOARD_ORIGIN` に公開ダッシュボードオリジン、`BETTER_AUTH_SECRET` に十分に強いシークレットを設定します。メールログイン用の配信設定も必要です。本番環境では HTTPS を使い、クライアントが接続する API オリジンを設定値と一致させてください。

API ホスト上の `/.well-known/oauth-protected-resource/api/mcp` と `/.well-known/oauth-authorization-server/api/auth` が検出用エンドポイントです。発行者は `/api/auth` です。アクセストークンの有効期間は 1 時間、更新トークンは 30 日で、更新のたびにローテーションします。データベースにはハッシュを保存します。

`MCP_SERVER_URL` が指す Go MCP サービスは、OCR や説明文生成などを行う内部の処理サービスです。外部クライアントは Bun API の `/api/mcp` に接続します。
