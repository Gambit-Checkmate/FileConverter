# FileConverter Desktop

Electron and React desktop app for the FileConverter conversion engine. The packaged app includes a Node.js worker that calls `@fileconverter/core`; users do not need to install Node.js separately.

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

The app uses Electron's native file and directory dialogs. The renderer has no Node.js access. Conversion runs in a separate bundled Node.js process through a small preload API. This keeps image processing isolated from the UI and avoids a known Sharp/Electron conflict on Linux.
