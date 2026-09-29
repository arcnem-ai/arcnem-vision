---
title: Deploy on Railway
description: Run Arcnem Vision on Railway from the template, with your own S3-compatible bucket.
---

The Railway template deploys the whole service in one project. You bring an S3-compatible bucket and your model provider keys.

| Service | What it runs |
| --- | --- |
| `vision-api` | The API. Before each deploy it runs migrations and the [production bootstrap](/reference/commands/#production-bootstrap). |
| `vision-dashboard` | The operator dashboard, the only public service besides the API. |
| `vision-agents` | Workflow execution. |
| `vision-mcp` | The internal analysis tools. |
| `pgvector` | Postgres with pgvector, on a volume. |
| `redis` | Realtime updates and caching. |
| `inngest`, `inngest-postgres`, `inngest-redis` | A self-hosted Inngest server for queued work. |

The services reach each other over Railway's private network. Only the API and the dashboard get public domains.

## Before you start

You need:

- **A bucket** on any S3-compatible storage, such as Cloudflare R2, Amazon S3 or Backblaze B2, and an access key that can read and write it. Images are uploaded straight from the browser to the bucket, so it must accept requests from the dashboard (see [Allow uploads from the dashboard](#allow-uploads-from-the-dashboard)).
- **A public base URL for the bucket**, such as an R2 custom domain or `r2.dev` URL. Only documents you publish are served from it. Everything else uses short-lived signed URLs.
- **An OpenAI API key** for descriptions, chat and workflow drafting.
- **A Replicate API token** for embeddings and segmentation.

With Cloudflare R2, the endpoint is `https://<account-id>.r2.cloudflarestorage.com` and the region is `auto`.

## Deploy the template

Open the [Arcnem Vision template](https://railway.com/deploy/arcnem-vision) (also linked from the **Deploy on Railway** button in the README) and fill in the variables:

| Variable | Service | Value |
| --- | --- | --- |
| `BOOTSTRAP_OWNER_EMAIL` | `vision-api` | Your email. This account becomes the first owner. |
| `BOOTSTRAP_ORGANIZATION_NAME` | `vision-api` | The name of your organization. |
| `AUTH_EMAIL_DELIVERY` | `vision-api` | `log` to read sign-in codes from the deploy logs, or `resend` to email them (also set `RESEND_API_KEY` and `TRANSACTIONAL_EMAIL_ADDRESS`). |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | `vision-api` | Your bucket. The other services use the same values. |
| `S3_USE_PATH_STYLE` | `vision-api` | `true` for R2 and most S3-compatible stores. |
| `OPENAI_API_KEY` | `vision-api` | Shared with the agents and tools. |
| `REPLICATE_API_TOKEN` | `vision-mcp` | Your Replicate token. |

Secrets such as the auth secret, database password, webhook encryption key and Inngest keys are generated for you.

When the deploy finishes, the API has created your owner account, an organization, a **Default Project** and a starter workflow, **Describe and index images**. Redeploys run the same steps and skip whatever already exists.

## Allow uploads from the dashboard

Once the dashboard has its domain, add a CORS rule to the bucket that allows it to `PUT` and `GET`. In R2, open the bucket's **Settings**, then **CORS policy**:

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

Uploads through the API with a workflow key don't need this. Only the browser does.

## Sign in

Open the dashboard and sign in with the owner email. With `AUTH_EMAIL_DELIVERY=log`, the code appears in the `vision-api` deploy logs as `[auth] sign-in OTP for <email>`. Anyone who can read those logs can sign in, so switch to `resend` before you share the project with anyone.

Sign-up and organization creation are off. The owner invites everyone else.

## Try it

- In the dashboard, open **Docs**, upload an image, and run **Describe and index images** on it.
- Or create a workflow key under **Projects & API Keys** and upload through the API. Workflow key uploads run the key's workflow automatically. See the [API reference](/reference/api/).

Each run's steps are shown under **Runs**.

## Keep in mind

- Railway builds the application services from the Arcnem Vision repository. Pinning or updating them follows Railway's usual source settings.
- The pgvector, Redis and Inngest data live on Railway volumes. Back up `pgvector` like any production database.
- Leave `INNGEST_DEV` unset on every deployed service. The Go SDK treats any value, even `0`, as dev mode, so the agents refuse to start with `0` or `false`.
