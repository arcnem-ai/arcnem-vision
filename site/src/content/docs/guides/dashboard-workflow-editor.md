---
title: Dashboard Workflow Editor
description: Build agent orchestration workflows, assign tools to workers, and run semantic document search in the dashboard.
---

The dashboard (`server/packages/dashboard`) is where operators configure orchestration without redeploying code.

## Tabs at a glance

- **Projects & Devices**: assign a workflow to each device.
- **Workflow Library**: create/edit graph workflows.
- **Documents**: browse uploads and run embedding-based search.

## Building workflows

Open **Workflow Library** and create a new workflow or edit an existing one.

### Node types

| Node type | Purpose | Required config |
|---|---|---|
| `worker` | ReAct-style worker agent | Model, optional system message, optional tools |
| `supervisor` | Orchestrates worker members | Model, `config.members` (worker node keys) |
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

## Validation rules before save

The canvas enforces:

- Unique node keys
- Valid node types (`worker`, `supervisor`, `tool`)
- Model required for worker/supervisor
- Exactly one tool on tool nodes
- Valid supervisor membership (workers only, no duplicates)
- At least one edge to `END`
- Entry node must have a path to `END`

If save fails, fix the message shown in the editor and retry.

## Assign workflow to devices

After saving a workflow:

1. Go to **Projects & Devices**.
2. Select a workflow for each device.
3. Click **Apply** to persist assignment.

This controls which graph runs for that device's uploaded documents.

## Semantic document search

In **Documents**, search with natural language (example: `red bike by a window`).

- If the API finds a matching description seed, results are ranked by embedding distance.
- If no seed is found, it falls back to lexical matching.
- Matched cards show a similarity badge (for example `92% match`).

Use this view to validate that the ingestion + embedding pipeline is producing useful retrieval behavior.
