# FileConverter Desktop

Electron and React desktop app for the FileConverter conversion engine. The packaged app includes a Node.js worker that calls `@fileconverter/core`; users do not need to install Node.js separately.

## Features

- Convert selected files or an input folder, optionally including subfolders. Symlinks and the selected output subtree are skipped during folder scans.
- Preview input/output paths, unsupported conversions, and naming collisions without creating conversion output.
- Set image quality, maximum dimensions, and metadata handling. Empty fields preserve preset values or engine defaults.
- Select OCR languages when converting images to TXT, including combined codes such as `eng+nor`. The first OCR run may download recognition resources.
- Merge PDFs in a chosen order, extract page ranges, or optimize PDF structure. Optimization does not recompress embedded images or guarantee a smaller file.
- Apply built-in presets, or create and delete custom global/project presets. Local presets require an explicitly selected project folder; global presets are shared with the CLI.
- Configure parallel jobs and retry attempts, including zero retries.
- Export result JSON, attempt logs as JSON, and readable text logs, including failed jobs.
- Inspect supported format pairs and copy application/runtime version information.

Existing output files are never overwritten. Files with conflicting destination names are rejected before conversion. Select a different output folder or rename inputs to resolve collisions.

The output format selector shows how many selected files support each format. Mixed selections can produce partial success; the results list explains each failed file.

## Verification

From the repository root:

```bash
npm run build
npm run lint
npm test
```

Core regression tests cover OCR language forwarding, recursive scans, read-only dry runs, and preset precedence. GUI worker tests cover image metadata/dimensions, PDF operations, queue concurrency/retries, mixed inputs, and protection against overwrite races. Native Electron smoke checks additionally exercise file dialogs, conversion, report exports, local preset management, and PDF reordering through the renderer and IPC.

## Development

From the repository root:

```bash
npm install
npm run gui:dev
```

`gui:dev` builds the core package, starts Vite, and opens Electron.
Use Node.js 22 LTS to build desktop packages; Electron Forge's ZIP extraction failed under Node.js 26 during verification.

## Package

```bash
npm run gui:build
```

This builds core and the renderer, then creates a platform-specific app under `packages/gui/out/`. To create a ZIP distributable, run `npm run make --workspace @fileconverter/gui`. Build separately on Windows, macOS, and Linux for each platform.

The desktop app uses the version from the root `package.json`. After a release-please release, GitHub Actions builds and attaches Linux x64, Windows x64, and macOS arm64 ZIP files to that GitHub release. The desktop app is not published to npm. Pull requests also build the ZIP on all three platforms so packaging failures are caught before release.

The app uses Electron's native file and directory dialogs. The renderer has no Node.js access. Conversion runs in a separate bundled Node.js process through a small preload API. This keeps image processing isolated from the UI and avoids a known Sharp/Electron conflict on Linux.
