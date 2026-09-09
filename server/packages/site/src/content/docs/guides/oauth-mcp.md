---
title: Connect an Agent with OAuth MCP
description: Connect an MCP client, edit and run workflows, inspect documents, and iterate safely with OAuth permissions.
---

Arcnem Vision exposes a remote MCP endpoint at `/api/mcp` on the API server. An agent can inspect a workflow, copy or edit its graph, run it against project documents, and use the results to improve its next attempt.

## Connect

1. Add `https://api.example.com/api/mcp` as a remote Streamable HTTP MCP server in your client. Replace the host with your deployment's public API host. Local development uses `http://localhost:3000/api/mcp`.
2. Complete the browser sign-in on the dashboard and review the requested permissions.
3. Allow the connection, then ask the agent to list your projects and workflows.

![OAuth consent screen showing Codex and the requested permissions](/images/oauth-consent.jpg)

*Example: review the application and its requested permissions before allowing access.*

The client must support OAuth authorization code flow with PKCE and **Client ID Metadata Documents (CIMD)**. Clients that require Dynamic Client Registration are not supported. The client discovers the authorization server from the MCP endpoint's OAuth challenge and manages access and refresh tokens. A service API key is for the [REST service API](/reference/api/#service-api); MCP authenticates with OAuth.

Use your MCP client’s connection management to revoke its OAuth tokens. The standard token revocation endpoint is `/api/auth/oauth2/revoke` on the API host. Revoking the refresh token also invalidates its linked access token and prevents further refreshes. Removing a connection locally only revokes server access if the client also sends that revocation request; otherwise stored tokens remain usable until revoked or expired. Organization membership is checked again for each tool call.

## Tools and permissions

| Tool | Purpose | OAuth scope |
| --- | --- | --- |
| `list_projects` | Discover projects and their organizations. | `projects:read` |
| `list_workflows` | Browse workflow summaries in an organization. | `workflows:read` |
| `get_workflow` | Read the complete editable definition and its revision. | `workflows:read` |
| `get_workflow_catalog` | Discover models, processing tools, node configuration schemas, and mapping rules. | `workflows:read` |
| `create_workflow` | Save a new graph or a copy of another workflow. | `workflows:write` |
| `update_workflow` | Replace a graph definition using the revision that was read. | `workflows:write` |
| `execute_workflow` | Queue a saved graph against documents in a project. | `workflows:execute` |
| `list_executions` | Find earlier executions in a project. | `workflows:read` |
| `get_execution` | Read status, outputs, errors, and optional step details. | `workflows:read` |
| `list_documents` | Browse document summaries in a project. | `documents:list` |
| `search_documents` | Search selected documents within a project. | `documents:search` |
| `get_document` | Read document details and available extracted content. | `documents:read` |

Clients can also request `offline_access` to keep a connection through token refresh. Request only the scopes needed for the task. Granting a scope does not give access to organizations or projects outside the signed-in user's memberships.

List tools paginate their results. Use detailed reads when you need a graph definition, document content, or execution trace. The tool schemas returned by the server describe each argument and its limits.

## Iterate on a workflow

A useful request to an agent is:

> Find my document review workflow, create an experimental copy, and run it on a small set of documents in my project. Inspect the outputs and execution steps, adjust the prompt or graph, and run another experiment. Tell me which changes improved the results.

The agent follows this loop:

1. Use `list_projects`, `list_workflows`, and `get_workflow_catalog` to find the project, source graph, and valid configuration values. Select sample documents with `list_documents` or `search_documents`.
2. Read the source with `get_workflow`. Pass its `definition` to `create_workflow` with a new name, then read the created workflow. Copies have their own workflow and node IDs.
3. Edit that definition and call `update_workflow` with its `workflowId` and `expectedRevision`. Send the full definition, including the nodes and edges to keep. The returned revision identifies the saved edit.
4. Call `execute_workflow` for the copied workflow and sample documents. Use a **new idempotency key for each new experiment**. Reuse a key only when retrying the same execution request after an uncertain response.
5. Read the execution until it finishes. Inspect outputs, errors, and step details, then repeat from the latest saved definition.

A stale `expectedRevision` rejects the update without changing the graph. Read the latest workflow, reapply the intended edit, and retry with its new revision. Do not blindly overwrite a newer definition.

Edits to a saved graph affect future executions, including other clients that use that graph. Already queued executions keep the graph snapshot captured when they were accepted. Execution results include the graph snapshot hash so an agent can distinguish runs after a graph changes. Create a copy when an experiment should have its own saved workflow.

### Graph configuration

`get_workflow` returns the editable data in `definition`, with `name`, `description`, `entryNode`, `stateSchema`, `nodes`, and `edges`. Node configuration includes prompts, model IDs, input/output keys, processing tool IDs, and canvas positions. Keep node IDs when editing that same graph; creating a copy assigns new IDs.

Use `get_workflow_catalog` for supported worker models and each node type's configuration schema. Worker and supervisor nodes require a model. A tool node calls exactly one processing tool; its input and output schemas are in the catalog. Condition nodes branch with `equals` or `contains`.

`stateSchema` configures state reducers. It maps state keys to `append` or `overwrite`; it is not a JSON Schema for validating outputs. For example:

```json
{
  "messages": "append",
  "review": "overwrite"
}
```

Tool input mappings map argument names to state keys. Prefix literal strings with `_const:`, for example `"provider": "_const:OPENAI"`. Nested objects and arrays use the same rule for their string values. Tool output mappings map result fields to destination state keys.

## Self-hosting

The OAuth MCP server runs inside the existing Bun API. Apply the database migrations before starting the updated API. Configure:

| API environment variable | Value |
| --- | --- |
| `BETTER_AUTH_BASE_URL` | The public API origin, for example `https://api.example.com`. |
| `DASHBOARD_ORIGIN` | The public dashboard origin, for example `https://app.example.com`. |
| `BETTER_AUTH_SECRET` | A strong deployment secret shared by the API instances. |

The existing email delivery settings must support the dashboard's email sign-in. Production connections use HTTPS. Keep the configured API origin consistent with the URL clients use; it determines the token audience and discovery URLs.

OAuth discovery is served at `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server/api/auth` on the API host. The issuer is `/api/auth`. Access tokens last one hour; refresh tokens last 30 days and rotate on use. Tokens are stored hashed in the database.

The Go MCP service configured by `MCP_SERVER_URL` remains the internal processing service for OCR, descriptions, embeddings, segmentation, and retrieval. Remote clients connect to the Bun API's `/api/mcp` endpoint.
