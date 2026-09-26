# Contributing to FileConverter

Thank you for your interest in contributing to FileConverter! This document explains how to get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22 (LTS)
- npm (comes with Node.js)

### Getting started

```bash
git clone https://github.com/Marentius/FileConverter.git
cd FileConverter
npm run setup
```

This installs all dependencies and builds the core package. No external system programs are required.

### Project structure

```
FileConverter/
├── packages/
│   ├── core/       # CLI + conversion engine (TypeScript)
│   └── gui/        # Desktop app — Electron + React
├── package.json    # Workspace root
└── ...
```

Most contributions will be in `packages/core/`.

### Useful commands

```bash
# Build
npm run core:build

# Run tests
cd packages/core
npm test              # All tests
npm run test:unit     # Adapter tests only
npm run test:integration
npm run test:e2e

# Lint
npm run lint
npm run lint:fix
```

## Making Changes

### 1. Create a branch

Use a descriptive branch name:

```bash
git checkout -b feat/add-svg-support
git checkout -b fix/pdf-merge-page-order
git checkout -b docs/update-cli-reference
```

### 2. Write code

- Follow the existing code style (enforced by ESLint and Prettier).
- Add tests for new functionality. We follow test-driven development — write the failing test first.
- Keep functions short and focused.
- Use TypeScript strict mode. Avoid `any`.

### 3. Commit with Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) because our release tooling depends on it. Every commit message must follow this format:

```
<type>: <description>

[optional body]
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build, CI, tooling changes |
| `perf` | Performance improvement |

**Examples:**

```
feat: add SVG to PNG conversion via sharp
fix: correct page order when merging PDFs
docs: add OCR language codes to README
test: add integration test for batch HTML conversion
chore: upgrade eslint to v10
```

A breaking change adds `!` after the type:

```
feat!: remove RTF format support
```

### 4. Run checks before pushing

```bash
cd packages/core
npm run lint
npm test
```

All tests must pass. The CI pipeline will verify this automatically.

### 5. Open a Pull Request

- Fill in the PR template.
- Reference any related issues (e.g. `Closes #42`).
- Keep PRs focused — one feature or fix per PR.
- Expect review feedback. We may ask for changes before merging.

## Adding a New Adapter

FileConverter uses an adapter pattern. To add support for a new format:

1. Create a new adapter class in `packages/core/src/adapters/` extending `BaseAdapter`.
2. Implement the `convert()` method.
3. Register it in `AdapterManager` (`adapter-manager.ts`).
4. Update `file-detector.ts` with the new format mappings.
5. Add unit tests in `packages/core/test/adapters/`.
6. Update the README with the new supported formats.

Use only npm packages — no external system dependencies.

## Reporting Bugs

Use the [bug report template](https://github.com/Marentius/FileConverter/issues/new?template=bug_report.yml) on GitHub. Include steps to reproduce, expected vs actual behavior, and your environment details.

## Requesting Features

Use the [feature request template](https://github.com/Marentius/FileConverter/issues/new?template=feature_request.yml). Describe the problem you're trying to solve, not just the solution you have in mind.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
