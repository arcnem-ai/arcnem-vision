---
title: ワークフローのWebhookを受け取る
description: ステータスをポーリングする代わりに、ワークフロー実行の完了・失敗時に署名付きのコールバックを受け取ります。
---

`GET /api/service/workflow-executions/:id` をポーリングする代わりに、HTTPSエンドポイントを登録すると、実行が終了したときに Arcnem Vision から署名付きのイベントが届きます。受信側は署名を検証してイベントを記録し、既存のサービスAPIで結果を取得します。

Webhookの対象は、サービスAPIキーで `POST /api/service/workflow-executions` から開始したワークフロー実行です。エンドポイントはそのサービスキーに属し、そのキーの実行だけがイベントを発生させます。

## エンドポイントを登録する

用途に合った方法を選んでください。どれも同じエンドポイントを管理します。

- **サービスAPI:** サービスキーで `POST /api/service/webhook-endpoints` を呼び出します。

  ```http
  POST /api/service/webhook-endpoints
  x-api-key: <サービスキー>
  content-type: application/json

  {"url": "https://example.com/webhooks/vision"}
  ```

- **ダッシュボード:** **Projects & API Keys** を開き、対象のサービスキーの **Webhooks** を展開してURLを追加します。
- **MCP:** `webhooks:read` と `webhooks:manage` の両方のスコープで、`list_service_keys` でキーを確認してから `create_webhook_endpoint` を呼び出します。

レスポンスには `whsec_` で始まる `signingSecret` が含まれます。**表示されるのは一度だけです。** 受信側に保存してください。1つのキーで有効にできるエンドポイントは最大5つです。

エンドポイントのURLはHTTPSで、公開アドレスだけに解決される必要があります。Visionは登録時と毎回の配信前にこれを確認し、確認したアドレスにのみ接続し、リダイレクトは追いません。

## 受信側に届く内容

各配信は小さなJSONボディと3つの [Standard Webhooks](https://www.standardwebhooks.com/) ヘッダーを持つ `POST` です。

```http
webhook-id: evt_0199a1c4-7e2b-7c3a-9f10-2b6f0c1d9e44
webhook-timestamp: 1790244903
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
content-type: application/json

{
  "type": "workflow.completed",
  "timestamp": "2026-09-24T10:15:03.412Z",
  "data": {
    "executionId": "0199a1c4-7e2b-7c3a-9f10-2b6f0c1d9e44",
    "workflowId": "0198f0aa-51c2-7b11-8d3e-6a0e1f7c2b90",
    "projectId": "0197e3b2-0c4d-7a55-a1f2-9b8c7d6e5f40",
    "status": "completed",
    "finishedAt": "2026-09-24T10:15:03.412Z",
    "execution": "/service/workflow-executions/0199a1c4-7e2b-7c3a-9f10-2b6f0c1d9e44"
  }
}
```

イベントの `type` は `workflow.completed` または `workflow.failed` です。ボディには識別子だけが含まれ、プロンプト、グラフの状態、ドキュメントのURL、プロバイダーのエラーは含まれません。結果は `GET /api/service/workflow-executions/:id` で取得します。

`webhook-id` はイベントの再試行・再送でも変わりません。`webhook-timestamp` は試行ごとに新しくなります。

## 検証と応答

1. **生のボディを検証する。** JSONを解析する前に、受信したバイト列そのもので署名を確認します。タイムスタンプが自分の時計から5分程度以上ずれているリクエストは拒否します。
2. **永続的に重複を除く。** 配信は少なくとも1回（at-least-once）なので、`webhook-id` を保存し、保存済みのイベントは無視します。
3. **すぐに応答する。** イベントを保存したら任意の `2xx` を返し、本来の処理はバックグラウンドで行います。
4. **結果を冪等に反映する。** `executionId` で自分のジョブを探します。開始リクエストの応答より先にWebhookが届くこともあるため、まだ記録していないジョブにも対応してください。

`standardwebhooks` パッケージと Hono を使った受信側の例:

```ts
import { Hono } from "hono";
import { Webhook } from "standardwebhooks";

const webhook = new Webhook(process.env.VISION_WEBHOOK_SECRET!); // "whsec_…"
const app = new Hono();

app.post("/webhooks/vision", async (c) => {
  const raw = await c.req.text();
  let event: { type: string; data: { executionId: string } };
  try {
    event = webhook.verify(raw, c.req.header()) as typeof event;
  } catch {
    return c.body(null, 400);
  }

  const isNew = await saveEventOnce(c.req.header("webhook-id")!, event);
  if (isNew) await enqueueJob("vision/execution.finished", event.data);
  return c.body(null, 204);
});
```

ライブラリを使わない場合、署名は `v1,` に続けて `webhook-id + "." + webhook-timestamp + "." + body` のHMAC-SHA256をbase64にしたものです。鍵はシークレットの `whsec_` 以降をbase64デコードした値です。ヘッダーには空白区切りで複数の署名が入ることがあります。どれか1つが一致すれば受け入れ、比較には定数時間の比較を使ってください。

## 再試行と再送

- **自動で再試行:** ネットワークエラー、タイムアウト、`408`、`429`、`5xx` は、間隔を空けて数回再試行されます。
- **再試行しない:** `4xx` やリダイレクトを含むそれ以外のレスポンスでは、配信は失敗として記録されます。
- **タイムアウト:** 各試行はレスポンスヘッダーの受信まで10秒です。レスポンスボディは読みません。

![サービスキーのWebhooksセクション（エンドポイントと配信履歴）](/dashboard-webhooks.png)

すべての試行は記録されます。`GET /api/service/webhook-deliveries`（`endpointId` または `executionId` で絞り込み）、ダッシュボードのキーの **Webhooks**、MCPの `list_webhook_deliveries` で確認できます。

イベントを送り直すには、`POST /api/service/webhook-deliveries/:id/resend`、ダッシュボードの **Resend**、または `resend_webhook_delivery` を使います。再送は同じ `webhook-id` とボディを元のエンドポイントに送り、ワークフローは再実行しません。進行中の以前の試行より優先されるため、再送を繰り返しても安全です。

受信側が停止していた間の取りこぼしに備えて、低頻度のステータス確認を残しておいてください（例: 1時間以上 `running` のままの実行を確認する）。

## 無効化とローテーション

`DELETE /api/service/webhook-endpoints/:id`（ダッシュボードの **Revoke**、MCPの `revoke_webhook_endpoint`）は以降の配信を止め、履歴は残します。すでに送信中のリクエストは取り消せません。

URLとシークレットは編集できません。変更するには新しいエンドポイントを登録し、そのシークレットで受信側をデプロイしてから古いエンドポイントを無効にします。両方が有効な間にキューに入ったイベントは両方に届くため、受信側は `webhook-id` で重複を除きます。エンドポイント登録前に作られた配信は、そのエンドポイントには送られません。

サービスキーが無効化・期限切れになった場合や、エンドポイントが無効化された場合、その配信は次の試行時に送信されずキャンセルされます。

## 権限

| 利用方法 | エンドポイントと履歴の参照 | 登録・無効化・再送 |
| --- | --- | --- |
| サービスAPIキー | `webhooks: ["read"]` | `webhooks: ["manage"]` |
| MCP（OAuth） | `webhooks:read` | `webhooks:manage`（キーや配信の確認には `webhooks:read` も必要） |
| ダッシュボード | 組織のメンバー | 組織のメンバー |

サービスキーには、既定で両方のWebhook権限が含まれます。

## セルフホスト

APIは起動時に `WEBHOOK_SECRET_ENCRYPTION_KEY`（base64でエンコードした32バイトのランダム値）を必要とします。署名シークレットの保存時の暗号化に使われます。envのサンプルには開発専用の値が入っています。デプロイ環境ごとに `openssl rand -base64 32` で別の鍵を生成してください。値は変更しないでください。変更すると既存のシークレットを読めなくなり、すべてのエンドポイントを作り直す必要があります。

ローカルのシード（`bun run db:seed`。`server/packages/db/.env` に同じ `WEBHOOK_SECRET_ENCRYPTION_KEY` が必要）は、Seed Project のサービスキーに `http://localhost:3999/webhooks/vision`（`SEED_WEBHOOK_RECEIVER_URL` で変更可能。Docker のサンプルでは `host.docker.internal`）のデモ用エンドポイント、サンプルの配信、無効化済みのエンドポイントを作成し、デモ用の署名シークレットを出力します。そのポートでシークレットを使って受信側を起動し、ダッシュボードから配信を再送すると、届く様子を確認できます。

`API_DEBUG=true` のローカル開発では、エンドポイントに `http://` やプライベートアドレスを使えるため、自分のマシン上の受信側も動作します。デプロイ環境では `API_DEBUG` を無効にしてください。
