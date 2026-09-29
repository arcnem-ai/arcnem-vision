---
title: Railwayにデプロイする
description: Railwayのテンプレートから、自分のS3互換バケットを使ってArcnem Visionを動かします。
---

Railwayのテンプレートは、サービス全体をひとつのプロジェクトにデプロイします。用意するのはS3互換のバケットとモデルプロバイダーのキーだけです。

| サービス | 内容 |
| --- | --- |
| `vision-api` | API。デプロイのたびに、マイグレーションと[本番環境のブートストラップ](/ja/reference/commands/#本番環境のブートストラップ)を実行します。 |
| `vision-dashboard` | オペレーター向けダッシュボード。API以外で唯一公開されるサービスです。 |
| `vision-agents` | ワークフローの実行。 |
| `vision-mcp` | 内部の解析ツール。 |
| `pgvector` | pgvector入りのPostgres（ボリューム上）。 |
| `redis` | リアルタイム更新とキャッシュ。 |
| `inngest`、`inngest-postgres`、`inngest-redis` | キュー処理のためのセルフホストのInngestサーバー。 |

サービス同士はRailwayのプライベートネットワークで通信します。公開ドメインを持つのはAPIとダッシュボードだけです。

## 事前に用意するもの

- **バケット**：Cloudflare R2、Amazon S3、Backblaze B2などのS3互換ストレージと、読み書きできるアクセスキー。画像はブラウザからバケットへ直接アップロードされるため、ダッシュボードからのリクエストを許可する必要があります（[ダッシュボードからのアップロードを許可する](#ダッシュボードからのアップロードを許可する)を参照）。
- **バケットの公開ベースURL**：R2のカスタムドメインや `r2.dev` のURLなど。公開したドキュメントだけがここから配信され、それ以外は有効期限の短い署名付きURLを使います。
- **OpenAIのAPIキー**：説明文の生成、チャット、ワークフローの下書きに使います。
- **ReplicateのAPIトークン**：埋め込みとセグメンテーションに使います。

Cloudflare R2の場合、エンドポイントは `https://<account-id>.r2.cloudflarestorage.com`、リージョンは `auto` です。

## テンプレートをデプロイする

[Arcnem Visionのテンプレート](https://railway.com/deploy/arcnem-vision)（READMEの **Deploy on Railway** ボタンからも開けます）を開き、変数を入力します。

| 変数 | サービス | 値 |
| --- | --- | --- |
| `BOOTSTRAP_OWNER_EMAIL` | `vision-api` | 自分のメールアドレス。このアカウントが最初のオーナーになります。 |
| `BOOTSTRAP_ORGANIZATION_NAME` | `vision-api` | 組織の名前。 |
| `AUTH_EMAIL_DELIVERY` | `vision-api` | デプロイログでサインインコードを確認するなら `log`、メールで送るなら `resend`（`RESEND_API_KEY` と `TRANSACTIONAL_EMAIL_ADDRESS` も設定）。 |
| `S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_BASE_URL` | `vision-api` | バケットの設定。ほかのサービスも同じ値を使います。 |
| `S3_USE_PATH_STYLE` | `vision-api` | R2や多くのS3互換ストレージでは `true`。 |
| `OPENAI_API_KEY` | `vision-api` | エージェントとツールでも共有されます。 |
| `REPLICATE_API_TOKEN` | `vision-mcp` | Replicateのトークン。 |

認証シークレット、データベースのパスワード、Webhookの暗号化キー、Inngestのキーなどのシークレットは自動で生成されます。

デプロイが終わると、APIがオーナーのアカウント、組織、**Default Project**、スターターワークフロー **Describe and index images** を作成しています。再デプロイでも同じ手順が実行され、既にあるものはスキップされます。

## ダッシュボードからのアップロードを許可する

ダッシュボードのドメインが決まったら、そのドメインからの `PUT` と `GET` を許可するCORSルールをバケットに追加します。R2では、バケットの **Settings** から **CORS policy** を開きます。

```json
[
  {
    "AllowedOrigins": ["https://<your-dashboard-domain>"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

ワークフローキーを使ったAPI経由のアップロードには不要で、ブラウザからのアップロードにだけ必要です。

## サインインする

ダッシュボードを開き、オーナーのメールアドレスでサインインします。`AUTH_EMAIL_DELIVERY=log` の場合、コードは `vision-api` のデプロイログに `[auth] sign-in OTP for <email>` として表示されます。ログを読める人は誰でもサインインできるため、プロジェクトを他の人と共有する前に `resend` に切り替えてください。

サインアップと組織の作成は無効になっています。他のメンバーはオーナーが招待します。

## 試してみる

- ダッシュボードの **Docs** で画像をアップロードし、**Describe and index images** を実行します。
- または **Projects & API Keys** でワークフローキーを作成し、APIからアップロードします。ワークフローキーでのアップロードは、そのキーのワークフローを自動で実行します。[APIリファレンス](/ja/reference/api/)を参照してください。

各実行のステップは **Runs** で確認できます。

## 注意点

- アプリケーションのサービスはArcnem Visionのリポジトリからビルドされます。バージョンの固定や更新は、Railwayの通常のソース設定に従います。
- pgvector、Redis、InngestのデータはRailwayのボリュームにあります。`pgvector` は他の本番データベースと同じようにバックアップしてください。
- デプロイするサービスでは `INNGEST_DEV` を設定しないでください。Go SDKは `0` を含むどんな値でも開発モードとして扱うため、エージェントは `0` や `false` が設定されていると起動しません。
