---
title: Dashboard Operations
description: Use the dashboard as the control plane for projects, API keys, workflows, uploads, retrieval, and live runs.
---

The dashboard (`server/packages/dashboard`) is the control plane for Arcnem Vision. If you never open the Flutter app, you still get the core platform experience here: create workflow keys and service keys, attach workflows, generate first-pass drafts with AI, upload images, inspect OCR and segmentation artifacts, search the corpus, and review step-by-step runs without redeploying code.

![Dashboard — projects and API keys](/dashboard-projects.png)

## Tabs at a glance

- **Projects & API Keys**: create projects, issue workflow keys with default workflows, and manage service keys for broader orchestration.
- **Workflow Library**: create/edit graph workflows, browse reusable templates, generate draft graphs from a natural-language brief, and start new graphs from the template picker.
- **Docs**: browse seeded or live uploads, run semantic search, ask grounded questions across the collection, upload directly from the dashboard, inspect related OCR and segmentation outputs, and queue workflows against any document.
- **Runs**: monitor execution history with live updates as runs start, advance, and finish.

## Projects and API keys

1. Create a project.
2. Create workflow keys inside that project and choose the saved workflow each key should run by default.
3. Create service API keys when backend jobs or integrations need broader orchestration access.

Notes:

- The generated secret is shown once; afterward the dashboard keeps only the public identifier.
- Existing keys can be renamed or disabled without changing document attribution.
- Workflow assignment is per workflow key, so one project can mix standard ingestion, OCR review, quality review, and segmentation keys.
- Workflow-key uploads use the API-key ingestion path and auto-run the key's bound workflow after `/uploads/ack`.

## Building workflows

![Workflow Library with document and segmentation workflows](/dashboard-workflows.png)

Open **Workflow Library** to create a blank workflow, generate a first draft with AI, start from a reusable template, or edit an existing graph.

![AI workflow draft generation dialog with a natural-language brief](/dashboard-workflow-ai-draft.png)

### Generating a draft with AI

1. Click **Generate With AI** from the Workflow Library hero.
2. Describe the workflow steps, routing rules, and the output you want saved.
3. Submit the brief.
4. The API matches your live model and tool catalog, then opens an unsaved draft graph in the editor.
5. Review the generated nodes, edges, and mappings before saving the workflow.

- The generated graph is intentionally unsaved until you confirm it in the canvas.
- Draft generation fails instead of opening a broken graph when required tool inputs or routing cannot be satisfied.

![Workflow canvas editor with the inspector pane open](/dashboard-workflow-editor.png)

![Template picker for starting a new graph from a workflow template](/dashboard-template-picker.png)

### Starting from a template

1. Click **Browse Templates** from the Workflow Library hero.
2. Search by workflow name, node role, or tool.
3. Review the template card for version, visibility, entry node, edge count, how many workflows have already been started from it, and sample node keys.
4. Click **Use Template**.
5. The dashboard clones the template into a new organization workflow, opens it in the canvas, and keeps the source template + version visible on the started workflow card.
6. If the template name is already taken, the dashboard auto-increments the new workflow name (`Foo`, `Foo 2`, and so on).

- Started workflows are independent copies. You can edit nodes, edges, tools, and metadata on the new graph without mutating the template.

### Node types

| Node type | Purpose | Required config |
|---|---|---|
| `worker` | ReAct-style worker agent | Model, optional system message, optional tools |
| `supervisor` | Orchestrates worker members | Model, `config.members` (worker node keys) |
| `condition` | Deterministic branch on state | `config.source_key`, `operator`, `value`, `true_target`, `false_target`, optional `case_sensitive` |
| `tool` | Single tool invocation node | Exactly one tool, optional IO mapping |

### Assigning tools to workers

1. Select a `worker` node.
2. In **Assigned tools**, toggle one or more tools.
3. Save the workflow.

Workers can hold multiple tool assignments.

### Tool node mappings

For `tool` nodes, map tool schema fields to graph state keys:

- `input_mapping`: graph state -> tool input
- `output_mapping`: tool output -> graph state

Literal input values can be passed with `_const:` (for example `_const:image/png`).

### Condition node routing

Use a `condition` node when the branch can be expressed as a simple state check
instead of an LLM decision.

- `source_key`: the state key to inspect, such as `ocr_text`
- `operator`: `contains` or `equals`
- `value`: the string to compare against
- `true_target` / `false_target`: target node keys or `END`
- `case_sensitive`: optional boolean
- `outputKey`: optional place to store the boolean match result for later steps

Condition nodes do not select a model or tools. Their outgoing edges are
managed: the canvas expects exactly two edges, and they must match the
configured `true_target` and `false_target`.

Before save, the canvas enforces unique node keys, model requirements, one tool per tool node, valid supervisor membership, valid condition routing targets, exactly two managed edges for each condition node, and entry-to-`END` reachability.

Segmentation flows are ordinary workflows. The difference is the tool they call: versioned segmentation models are registered in the database and invoked through MCP. OCR flows work the same way, except the tool is `create_document_ocr` and the result stays attached to the source document as persisted text plus metadata.

## Docs: search, chat, upload, OCR, and segmented results

![Docs tab with newer seeded images](/dashboard-docs.png)

- Search by meaning uses lexical ranking and can blend in semantic description matches when hybrid search is enabled.
- **Ask The Collection** opens an org-scoped drawer that answers using document descriptions, OCR text, and related segmentation context.
- Source cards show which document grounded the answer, including project and API-key badges when available.
- **New chat** clears the current ephemeral session without changing the document library.
- **Add From Dashboard** uploads a one-off image into a project without binding it to an API key.
- Dashboard uploads are intentionally separate from workflow-key automation: they create a document first, then let you queue whichever saved workflow you want.
- Click any document to choose a different workflow and queue it without changing the source key's saved assignment.

![Docs tab with collection chat open and grounded sources](/dashboard-docs-chat.png)

![Selected document with a related segmented result](/dashboard-docs-segmentation-detail.png)

- Related OCR results stay attached to the source document and show the model label, extracted text, average confidence when available, and the raw normalized payload.
- Derived segmented images stay attached to the source document and show the model label plus prompt used to create them.
- Segmentation outputs are stored as real documents, so they can be described, browsed, and reused in later workflows.
- OCR outputs are not separate documents; they are stored as rows in `document_ocr_results` so operators can review text extraction without creating duplicate media objects.

## Runs and realtime updates

![Runs tab with expanded run details](/dashboard-run-detail.png)

- The dashboard subscribes to `/api/realtime/dashboard` via Server-Sent Events.
- **Docs** refresh when documents are created, OCR results are written, descriptions are written, or segmentation results are persisted.
- **Runs** refresh when a run is created, when steps change, and when the run finishes.
- Expand a run to inspect initial state, per-step state deltas, final state, timing, and errors.

## OCR and segmentation workflows

- `create_document_ocr` persists normalized text, the raw OCR payload, and optional average confidence for a document.
- Use a `condition` node when OCR routing can be handled with a deterministic rule like "contains URGENT".
- Use a `supervisor` when OCR needs semantic judgment, such as routing to billing vs operations specialists.
- Versioned models in the `models` table can be marked as segmentation models and called from MCP.
- `create_document_segmentation` stores both the raw result payload and any derived segmented image.
- The seed includes `OCR Keyword Condition Router`, `OCR Review Supervisor`, language segmentation, and semantic segmentation showcase workflows plus matching reusable templates, so you can test both blank-canvas editing and template-based starts immediately.
