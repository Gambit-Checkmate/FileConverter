# @fileconverter/core

[![npm version](https://img.shields.io/npm/v/@fileconverter/core.svg)](https://www.npmjs.com/package/@fileconverter/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A fast, zero-config file conversion CLI. Images, documents, office files, PDFs, and OCR — all powered by pure npm packages with **no external system dependencies**.

## Install

```bash
# Run directly (no install needed)
npx @fileconverter/core convert -i photo.png -o output/ --to jpg

# Or install globally
npm i -g @fileconverter/core
```

## Usage

```bash
# Convert an image
converter convert -i photo.png -o output/ --to jpg

# Word to PDF
converter convert -i report.docx -o output/ --to pdf

# Excel to HTML
converter convert -i data.xlsx -o output/ --to html

# PowerPoint to text
converter convert -i slides.pptx -o output/ --to txt

# Batch convert a folder of PNGs to WebP
converter convert -i screenshots/ -o optimized/ --to webp --quality 85 -r

# Markdown to PDF
converter convert -i README.md -o output/ --to pdf

# Merge PDFs
converter pdf --merge a.pdf b.pdf c.pdf -o merged.pdf

# Split specific pages from a PDF
converter pdf --split thesis.pdf --pages 1-5,10 -o excerpt.pdf

# OCR: extract text from an image
converter ocr -i scan.png -o result.txt --lang eng
```

> Office-to-PDF conversions prefer Microsoft Word for DOCX and RTF files on Windows, then LibreOffice for all supported Office formats. Both preserve document layout more faithfully than the semantic npm fallback. Set `MICROSOFT_WORD_PATH` or `LIBREOFFICE_PATH` to use executables outside the standard install locations. Without either application, FileConverter preserves basic content but not complex layout, fonts, or positioning.

## Supported Formats

| Category | Input | Output |
|----------|-------|--------|
| **Images** | PNG, JPG, JPEG, WebP, TIFF, BMP, GIF, HEIC | JPG, PNG, WebP, TIFF |
| **Office** | DOCX, XLSX, PPTX, ODT, RTF | PDF, HTML, TXT, Markdown |
| **Documents** | Markdown, HTML, TXT | PDF, HTML, Markdown, TXT |
| **PDF** | PDF | DOCX, TXT, PNG, JPG, WebP, PDF (merge, split, optimize) |
| **OCR** | PNG, JPG, TIFF, BMP, WebP | TXT |

### PDF to Word

```bash
converter convert -i report.pdf -o output/ --to docx
```

Local, open-source conversion with PDF.js, canvas and JSZip; no paid license or
service is required. Text becomes editable positioned paragraphs, and simple
complete ruled tables become native Word tables. Images and other graphics are
preserved together in a page background at 150 DPI. Scanned pages and pages with
rotated/skewed text remain images without editable text or OCR.

Layout reconstruction is best effort: fonts are not embedded, complex or
borderless tables are not reconstructed as native tables, and exact appearance
in Word or Google Docs is not guaranteed. The desktop UI explains these limits;
library conversion metadata describes detected tables and image-only pages.
Library callers can set `pages` and `dpi` (72–300). Limits are 50 pages, 25 million
pixels per page, 125 million pixels per job, 50,000 text items and Word's maximum
page dimension of 22 inches. Existing destination files survive conversion failure.

## Commands

`convert`, `ocr`, and `pdf` exit with status 1 if any conversion job fails, including partial batch failures. Successful runs and `convert --dry-run` exit with status 0. `convert --json` still writes the complete result to stdout before exiting, so scripts can inspect both the report and the exit status.

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
| `--preset <name>` | Use a preset (e.g. `image/web`) |

### `pdf` — PDF operations

```bash
converter pdf --compress <file> -o <output>
converter pdf --merge <files...> -o <output>
converter pdf --split <file> --pages <range> -o <output>
```

### `ocr` — Text extraction

```bash
converter ocr -i <image> -o <output.txt> [--lang <language>]
```

## Presets

| Preset | Quality | Max Size | Strip Metadata |
|--------|---------|----------|----------------|
| `image/web` | 85 | 1920x1080 | Yes |
| `image/print` | 95 | 3000x3000 | No |
| `image/thumbnail` | 80 | 300x300 | Yes |
| `image/social` | 90 | 1200x1200 | Yes |
| `image/original` | 100 | — | No |

## Requirements

- **Node.js >= 18**
- No external system programs required

## License

MIT — see [LICENSE](https://github.com/Marentius/FileConverter/blob/main/LICENSE)
