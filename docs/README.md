# Documentation Guide

This directory contains long-form technical notes used by the project team and contributors.

## What should stay

- `embeddings.md`: current embedding implementation and operational constraints.
- `langchaingo.md`: how LangChain Go fits into the agents/MCP stack.
- `langgraphgo.md`: workflow orchestration patterns used by the Go agents service.
- `genui.md`: Flutter GenUI integration details for dynamic UI rendering.

These four docs are useful reference material for contributors and should remain in the open-source repo.

## Relationship to the docs site

- `/site` is the onboarding-first documentation site.
- `/docs` is the deep-dive reference layer.

When one of these deep dives changes, update the matching guide in:

- `site/src/content/docs/guides/`
- `site/src/content/docs/ja/guides/` (if Japanese docs are maintained in lockstep)

## Suggested maintenance rule

For open-source releases, treat `/site` as the first-stop user experience and `/docs` as advanced reference.
