# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue. Include the affected version or commit, the steps to reproduce, and the impact you expect. We aim to acknowledge reports within a few working days.

Security fixes go into the latest release. Arcnem Vision is pre-1.0, so older minor versions don't get backports.

## Security model

Arcnem Vision is designed to run as a single-tenant deployment per operator. Organizations and projects separate data inside a deployment.

**Authentication**
- Dashboard users sign in with Better Auth sessions.
- Programs use API keys, which are stored only as SHA-256 hashes.
- A **workflow key** is bound to one project and one workflow. It can upload, list and read its own documents.
- A **service key** is bound to one project. It can upload, run workflows, search, publish and manage webhooks within that project.
- External agents connect to `/api/mcp` with OAuth 2.1 (PKCE and client ID metadata documents). The user consents to specific scopes: `projects:read`, `documents:list`, `documents:read`, `documents:search`, `workflows:read`, `workflows:write`, `workflows:execute`, `webhooks:read` and `webhooks:manage`. Creating API keys and signing in stay human-only.

**Authorization**
- Every API operation checks the caller's organization and project.
- A workflow run's internal tool calls are authorized against the documents and project recorded for that run. Graph-controlled arguments are never trusted for this.
- **Roles are not enforced yet.** Every member of an organization can manage its projects, API keys and webhooks. Invite only people you would trust as administrators.

**Webhooks**
- Deliveries are signed per endpoint following Standard Webhooks.
- Signing secrets are encrypted at rest with `WEBHOOK_SECRET_ENCRYPTION_KEY`.
- Deliveries only go to public `https://` addresses. DNS is resolved once, the address is checked, and the connection is pinned to that address, so a receiver can't redirect a delivery to a private network.

**Configuration**
- Deployments must set every secret themselves. The values in the `.env` examples are for local development only.
- `API_DEBUG` bypasses session checks and relaxes API key checks for the local seed. `WEBHOOK_ALLOW_PRIVATE_DESTINATIONS` allows `http://` and private webhook receivers. Both are local-only: the API refuses to start with either enabled unless `BETTER_AUTH_BASE_URL` is a local `http://` URL.
- `AUTH_ENABLE_SIGN_UP` and `AUTH_ENABLE_ORGANIZATION_CREATION` have no defaults. Set them to `false` unless open registration is intended, because signed-up users can spend your model provider credits.
- API request bodies are limited to 1 MiB. Uploads go straight to object storage and are checked against the 10 MiB limit when they are acknowledged.

## Known limitations

- A presigned upload URL stays valid for 5 minutes. During that window the uploader can overwrite an object after it has been acknowledged. Processing caps and downscales what it reads.
- Presigned uploads that are never acknowledged, and webhook delivery history, are kept indefinitely.
- Signed download URLs for documents last 5 minutes and can't be revoked before they expire.
