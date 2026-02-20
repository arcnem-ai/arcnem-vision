---
title: Contributing
description: Practical contribution expectations, quality checks, and review scope.
---

Thanks for contributing to Arcnem Vision.

## Start here

- Read `/README.md` for architecture and local setup.
- Read `/CONTRIBUTING.md` for the contribution process.
- If you use AI coding agents, read `/AGENTS.md`.

## Expected quality checks

Run what is relevant to your changes:

```bash
# client
cd client && flutter analyze
cd client && flutter test

# server workspace
cd server && bunx biome check packages

# database schema -> Go model sync (when schema changes)
cd models/db && go run ./cmd/introspect
```

## PR scope expectations

- Keep changes focused on one concern.
- Include setup/migration notes when needed.
- Include screenshots or clips for UI changes.
- Note any new env vars, ports, or infra assumptions.

## Documentation expectations

- Update `/site` pages for onboarding-impacting changes.
- Update `/docs` deep dives when behavior/design details change.
- Keep English and Japanese docs aligned when possible.

## GitHub templates

Use the issue and PR templates under `.github/` for consistent reports and reviews.
