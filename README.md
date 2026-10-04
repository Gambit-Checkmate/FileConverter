# FileConverter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/Marentius/FileConverter/actions/workflows/ci.yml/badge.svg)](https://github.com/Marentius/FileConverter/actions/workflows/ci.yml)

A fast, zero-config file conversion CLI. Images, office documents, PDFs, and OCR — all powered by npm packages with **no external system dependencies**.

## Quick Start

### Install from npm

```bash
# Run directly (no install needed)
npx @fileconverter/core convert -i photo.png -o output/ --to jpg

# Or install globally
npm i -g @fileconverter/core
converter convert -i photo.png -o output/ --to jpg
```

### Build from source

```bash
git clone https://github.com/Marentius/FileConverter.git
cd FileConverter
npm run setup
```

No need to install LibreOffice, Pandoc, Ghostscript, or Tesseract — everything runs on pure npm packages.

```bash
# Convert an image
converter convert -i photo.png -o output/ --to jpg

# Word to PDF
converter convert -i report.docx -o output/ --to pdf

# Excel to HTML
converter convert -i data.xlsx -o output/ --to html

# Markdown to PDF
converter convert -i README.md -o output/ --to pdf

# Merge PDFs
converter pdf --merge a.pdf b.pdf c.pdf -o merged.pdf

# OCR: extract text from an image
converter ocr -i scan.png -o result.txt
```

## Supported Formats

| Category | Input | Output |
|----------|-------|--------|
| **Images** | PNG, JPG, JPEG, WebP, TIFF, BMP, GIF, HEIC | JPG, PNG, WebP, TIFF |
| **Office** | DOCX, XLSX, PPTX, ODT, RTF | PDF, HTML, TXT, Markdown |
| **Documents** | Markdown, HTML, TXT | PDF, HTML, Markdown, TXT |
| **PDF** | PDF | DOCX, TXT, PNG, JPG, WebP, PDF (merge, split, optimize) |
| **OCR** | PNG, JPG, TIFF, BMP, WebP | TXT |

### PDF to Word (DOCX)

```bash
converter convert -i report.pdf -o output/ --to docx
```

PDF → DOCX runs locally with the existing open-source PDF.js (Apache-2.0),
canvas and JSZip (MIT) packages. It requires no paid license, key, service or
additional installation. DOCX is also available in the desktop output format list.

Text is reconstructed as editable, positioned Word paragraphs with font size,
basic font styling and color. Complete, simple ruled grids become editable Word
tables. Each page retains its dimensions; images, table rules, shading and other
graphics are rendered into a background image per page (150 DPI by default).
The graphics are preserved visually rather than as individually editable objects.

This is a best-effort reconstruction, **not a guarantee of identical layout**.
Fonts must be available in the Word viewer and are not embedded. Borderless,
merged-cell and complex tables retain positioned text rather than native table
structure. Scanned pages and pages with rotated/skewed text are kept as page
images, with no editable text or OCR. Google Docs may interpret Word positioning
differently. The desktop UI explains these limits before conversion; library
results also include a warning describing image-only pages and detected tables.

Library callers can select pages with `pages` and set graphics `dpi` (72–300).
Conversions are limited to 50 pages, 25 million pixels per page, 125 million pixels
in total and 50,000 text items. Word pages cannot exceed 22 inches per dimension.
Failed conversions preserve any existing destination file.
Animated GIF and WebP inputs are converted using only their first frame. The CLI warns for multi-frame inputs during both conversion and `--dry-run`; `--json` includes the warning in the plan.

## CLI Reference

### `convert` — File conversion

```bash
converter convert -i <input> -o <output> --to <format> [options]
```

| Option | Description |
|--------|-------------|
| `-i, --in <path>` | Input file or folder |
| `-o, --out <path>` | Output folder |
| `-t, --to <format>` | Target format (e.g. `png`, `pdf`, `html`) |
| `-r, --recursive` | Search subfolders recursively |
| `--dry-run` | Preview without converting |
| `--concurrency <n>` | Parallel jobs (default: 1) |
| `--retries <n>` | Retry attempts per job (default: 2) |
| `--log-file-json <path>` | Save conversion job logs as JSON |
| `--log-file-txt <path>` | Save conversion job logs as readable text |
| `--quality <1-100>` | Image quality |
| `--max-width <px>` | Maximum image width |
| `--max-height <px>` | Maximum image height |
| `--strip-metadata` | Remove image metadata |
| `--preset <name>` | Use a preset (see below) |

### `pdf` — PDF operations

```bash
converter pdf --compress <file> -o <output>
converter pdf --merge <files...> -o <output>
converter pdf --split <file> --pages <range> -o <output>
```

| Option | Description |
|--------|-------------|
| `--compress <file>` | Optimize a PDF (remove orphaned objects) |
| `--merge <files...>` | Merge multiple PDFs into one |
| `--split <file>` | Extract pages from a PDF |
| `--pages <range>` | Page ranges, e.g. `1-3,5,7-9` |
| `-o, --out <file>` | Output file |

### `ocr` — Text extraction

```bash
converter ocr -i <image> -o <output.txt> [--lang <language>]
```

| Option | Description |
|--------|-------------|
| `-i, --in <file>` | Input image (PNG, JPG, TIFF, etc.) |
| `-o, --out <file>` | Output text file |
| `--lang <code>` | Language code (default: `eng`). Examples: `nno`, `deu`, `fra` |

### Other commands

```bash
converter formats          # List supported formats
converter presets          # List image presets
converter preset list      # List all presets (built-in + custom)
converter preset create    # Create a custom preset
converter preset delete    # Delete a custom preset
converter version          # Show version and system info
```

## Presets

Built-in image presets:

| Preset | Quality | Max Size | Strip Metadata |
|--------|---------|----------|----------------|
| `image/web` | 85 | 1920x1080 | Yes |
| `image/print` | 95 | 3000x3000 | No |
| `image/thumbnail` | 80 | 300x300 | Yes |
| `image/social` | 90 | 1200x1200 | Yes |
| `image/original` | 100 | — | No |

```bash
# Use a preset
converter convert -i photos/ -o output/ --to webp --preset image/web -r

# Create a custom preset
converter preset create -n "my-preset" -d "Small JPGs" -t image -p "quality=70;maxWidth=800"
```

## Examples

```bash
# Batch convert a folder of PNGs to WebP
converter convert -i screenshots/ -o optimized/ --to webp --quality 85 -r

# Word document to PDF
converter convert -i report.docx -o output/ --to pdf

# Excel spreadsheet to HTML table
converter convert -i budget.xlsx -o output/ --to html

# PowerPoint to plain text
converter convert -i slides.pptx -o output/ --to txt

# RTF to Markdown
converter convert -i notes.rtf -o output/ --to md

# Markdown to HTML
converter convert -i docs/ -o site/ --to html -r

# Split specific pages from a PDF
converter pdf --split thesis.pdf --pages 1-5,10 -o excerpt.pdf

# OCR a scanned document in Norwegian
converter ocr -i scan.png -o text.txt --lang nno

# Dry run to preview what would happen
converter convert -i archive/ -o output/ --to jpg --dry-run
```

## Architecture

```
FileConverter/
├── packages/
│   ├── core/                  # CLI + conversion engine
│   │   ├── src/
│   │   │   ├── cli.ts         # CLI entry point (Commander.js)
│   │   │   ├── converter.ts   # Orchestration layer
│   │   │   ├── file-scanner.ts
│   │   │   ├── job-queue.ts   # Parallel execution (p-queue)
│   │   │   ├── adapters/
│   │   │   │   ├── images/    # Sharp
│   │   │   │   ├── document/  # marked + pdfkit + turndown
│   │   │   │   ├── office/    # mammoth + JSZip/XML + officeparser
│   │   │   │   ├── pdf/       # pdf-lib
│   │   │   │   └── ocr/       # tesseract.js
│   │   │   ├── presets/       # Image presets
│   │   │   └── config/        # Preset management
│   │   └── test/
│   └── gui/                   # Electron + React desktop app
└── package.json               # Workspace root
```

### Adapter pattern

All conversions flow through adapters: `CLI → Converter → FileScanner → JobQueue → Adapter`

The `AdapterManager` selects the right adapter based on input/output format. Each adapter extends `BaseAdapter` and implements a `convert()` method. Currently registered adapters:

| Adapter | Library | Handles |
|---------|---------|---------|
| `SharpAdapter` | sharp | Image format conversion, resize, quality |
| `DocumentAdapter` | marked, pdfkit, turndown | MD/HTML/TXT conversions |
| `OfficeAdapter` | mammoth, JSZip/XML, officeparser | DOCX/XLSX/PPTX/ODT/RTF conversions |
| `PdfAdapter` | pdf-lib | PDF merge, split, optimize |
| `OcrAdapter` | tesseract.js | Image-to-text extraction |

## Development

```bash
# Install all dependencies
npm install

# Build core
npm run core:build

# Watch mode
npm run core:dev

# Run tests
cd packages/core
npm test              # All tests
npm run test:unit     # Adapter unit tests
npm run test:integration
npm run test:e2e
npm run test:coverage

# Lint
npm run lint
npm run lint:fix
```

### Running a single test

```bash
cd packages/core
npx jest path/to/test.spec.ts
```

## Tech Stack

| Component | Library |
|-----------|---------|
| CLI framework | Commander.js |
| Image processing | Sharp |
| Word documents | mammoth (DOCX to HTML) |
| Spreadsheets | JSZip + XML parsing (XLSX to HTML tables) |
| Presentations/ODT | officeparser (text extraction) |
| PDF manipulation | pdf-lib |
| PDF generation | PDFKit |
| Markdown parsing | marked |
| HTML-to-Markdown | Turndown |
| OCR | tesseract.js (WebAssembly) |
| Logging | Winston |
| Build | tsup (CJS + ESM, targeting Node 22) |
| Testing | Jest + ts-jest |
| Linting | ESLint 10 (flat config) + TypeScript-ESLint |
| Desktop GUI | Electron + React |

## Requirements

- **Node.js >= 18**
- No external system programs required

## License

MIT

## Releases

The npm CLI/core and desktop app have independent versions. Desktop releases bundle an explicitly pinned core version. See [CI/CD and release policy](docs/releases.md) for versioning, platform builds, and publication.
