# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

FileConverter is a file conversion tool with two packages:
- `packages/core` — TypeScript CLI and conversion engine (ready for use)
- `packages/gui` — Electron + React desktop application

All conversions use pure npm packages. No external system programs (Pandoc, Ghostscript, LibreOffice, etc.) are required.

## Commands

### Root Workspace
```bash
npm install        # Install all dependencies
npm run setup      # Install + build core
npm run build      # Build all packages
npm run test       # Run tests in all packages
npm run lint       # Lint all packages
npm run clean      # Clean build artifacts
npm run gui:dev    # Start GUI in dev mode
npm run core:build # Build CLI only
npm run core:dev   # Watch mode for CLI
```

### Core Package (`packages/core`)
```bash
npm run build           # Build with tsup (outputs CJS + ESM to dist/)
npm run dev             # Watch mode
npm run test            # Run all tests
npm run test:unit       # Unit tests only (adapters)
npm run test:integration
npm run test:e2e
npm run test:coverage
npm run lint
npm run lint:fix
```

### Run a single test file
```bash
cd packages/core && npx jest path/to/test.spec.ts
```

## Architecture

### Adapter Pattern
All conversions go through adapters in `packages/core/src/adapters/`. The `AdapterManager` (`adapter-manager.ts`) selects the appropriate adapter based on input/output format pairs. Each adapter extends `BaseAdapter` (`base-adapter.ts`).

Registered adapters:
- `adapters/images/sharp-adapter.ts` — Sharp (image format conversion, resize, quality)
- `adapters/document/document-adapter.ts` — marked + pdfkit + turndown (MD/HTML/TXT conversions)
- `adapters/pdf/pdf-adapter.ts` — pdf-lib (merge, split, optimize)
- `adapters/ocr/ocr-adapter.ts` — tesseract.js (image-to-text OCR)

### Core Flow
`cli.ts` → `converter.ts` (orchestrates) → `file-scanner.ts` (scan + plan) → `job-queue.ts` (parallel execution via p-queue) → adapter

### Key Types
All interfaces are in `src/types.ts`: `ConversionPlan`, `ConversionOptions`, `ConversionJob`.

### Preset System
Global and local conversion presets managed by `src/config/config-manager.ts`. Image preset definitions live in `src/presets/image-presets.ts`.

## Testing Notes

Jest mocks several ESM modules to run in CJS mode: `file-type`, `p-queue`, `chalk`, `cli-progress`. ESM packages `marked` and `turndown` are transformed via `transformIgnorePatterns` in `jest.config.js`.

## Build Output

tsup bundles `packages/core` to both CJS (`dist/`) and ESM formats, targeting Node 22. The CLI entry point is `dist/cli.js`.

## Commit Convention

This project uses Conventional Commits. Release-please automates versioning and changelog generation based on commit prefixes (`feat:`, `fix:`, `docs:`, etc.).
