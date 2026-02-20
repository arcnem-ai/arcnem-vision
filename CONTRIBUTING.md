# Contributing to Arcnem Vision

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/arcnem-vision.git`
3. Create a branch: `git checkout -b my-feature`
4. Make your changes
5. Push and open a pull request

## Development Setup

```bash
tilt up
```

See [README.md](README.md) for setup and architecture. If you use AI coding agents, also read [AGENTS.md](AGENTS.md).

## Code Style

- **TypeScript:** Biome (tabs, double quotes). Run `bunx biome check packages` from `server/`.
- **Dart:** `flutter_lints`. Run `flutter analyze` from `client/`.
- **Go:** `gofmt`.

Please ensure your code passes linting before submitting a PR.

## Pull Requests

- Keep PRs focused on a single change.
- Write a clear description of what changed and why.
- Link any related issues.
- Make sure existing tests pass (`flutter test` for the client).

## Reporting Issues

Open an issue on GitHub with:

- A clear title and description
- Steps to reproduce (if applicable)
- Expected vs. actual behavior
- Relevant logs or screenshots

Issue and PR templates are available in `.github/` to keep reports and reviews consistent.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
