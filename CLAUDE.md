# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FotosApp is a product photo editor PWA — a vanilla JavaScript SPA (no framework, no build step) that processes product photos by changing background colors using HSL manipulation and Gemini AI image generation.

## Running Locally

No build step. Open `index.html` directly or serve with any static server:
```bash
npx serve .
```

## Architecture

### Entry Flow
`index.html` → loads `src/main.js` (ES module) → imports router → `router.navegar('editor')` on DOMContentLoaded.

### Core Files
- **`src/config.js`** — App config, color presets, future Supabase/Gemini config placeholders
- **`src/main.js`** — Entry point, registers Service Worker, navigates to initial route
- **`src/router.js`** — `router.navegar(ruta)` — renders modules into `#app-content`, manages nav state
- **`src/utils.js`** — Helpers: `mostrarNotificacion`, `descargarArchivo`, `descargarComoZip`, `hslToRgb`, `rgbToHsl`, `cargarImagen`, `leerArchivoComoDataURL`, `validarArchivo`, `confirmarAccion`
- **`src/lib/imageProcessor.js`** — Image processing engine: `esFondo()`, `cambiarTonoFondo()`, `reemplazarFondoSolido()`, `eliminarFondo()`, `procesar()`, `generarPreview()`
- **`service-worker.js`** — PWA cache with Network First strategy for local assets

### Module Pattern
Each module in `src/modules/` exports an object with a `render(contenedor)` method and public functions. Functions are exposed globally on `window.*` for HTML `onclick` handlers.

### Key Modules
| Module | Responsibility |
|--------|---------------|
| `editor.js` | Single photo editing: color picker, HSL sliders, brush tool (restore/apply), AI processing via Gemini, download |
| `lote.js` | Batch processing: folder selection (File System Access API), automatic/assisted modes, reference image for tone consistency, ZIP download, rate limiting |
| `mockup.js` | Photorealistic mockup generation: position logo on bag photos, dual AI provider (Gemini/OpenAI), zoom, multiple bags, batch generation |

## Mockup Module

### Overview
Generates photorealistic mockups of logos/designs screen-printed on canvas tote bags using AI. Supports dual AI providers and multiple bag photos with independent logo positioning.

### Key State
- `bolsas[]` — Array of bag objects, each with: `{ imagen, dataURL, nombre, diseno: {x, y, ancho, alto, escala, rotacion}, resultadoIA }`
- `bolsaActualIdx` — Index of currently selected bag in the editor
- `imagenDiseno` / `imagenDisenoDataURL` — Single shared logo across all bags
- `zoom` — Current zoom level (0.5x–5x), applied via CSS `transform: scale()`

### Canvas Editor
- HTML5 Canvas with drag-to-move, corner handles to resize (preserves aspect ratio), rotation slider
- Zoom: mouse wheel (centered on cursor), +/- buttons, Ctrl+click pan
- Handles and borders compensate for zoom (`lineWidth / zoom`) to maintain constant visual size

### AI Generation Strategy
Sends 3 images to the AI provider:
1. **Clean bag photo** — texture context beneath the logo
2. **Clean logo** — full detail for faithful reproduction
3. **Composite** — bag + logo positioned, showing exact placement/size

### Dual AI Providers

**Gemini 3 Pro Image** (`gemini-3-pro-image-preview`):
- REST API, JSON with base64 `inlineData`
- Shares API key with Editor module (`fotosapp_gemini_key`)
- `responseModalities: ['IMAGE', 'TEXT']`

**OpenAI gpt-image** (`gpt-image-1`):
- REST API, FormData multipart with `image[]` blobs
- Independent API key (`fotosapp_openai_key`)
- Quality: `medium` (default) or `high`

### Batch Generation
- "Generar todos" button appears when 2+ bags are loaded
- Processes sequentially with 3-second delay between calls (rate limiting)
- Progress bar tracks completion

### Configuration
Provider selection and API keys are managed via a config panel (gear icon), stored in `localStorage`.

## Image Processing Pipeline

### HSL Background Detection (`esFondo()`)
Detects neutral/gray background pixels by checking:
- **Low saturation** (`<= toleranciaSaturacion`, default 30)
- **Luminosity range** (min 10, max 90 — excludes black and white)

### Processing Modes
- **Tono** (default): Changes hue/saturation of detected background pixels, preserves luminosity for texture
- **Solido**: Replaces background with flat color
- **Transparente**: Makes background pixels transparent (PNG output)

### AI Processing (Gemini)
- Uses **Gemini 3 Pro Image** (`gemini-3-pro-image-preview`) via REST API
- API key stored in `localStorage` as `fotosapp_gemini_key`
- Sends original image + color description, receives edited image
- Editor stores AI result in `canvasResultadoIA` for direct download
- Batch mode supports **reference image** for tone consistency across photos

## Key State Variables (Editor)

| Variable | Purpose |
|----------|---------|
| `imagenOriginal` | Original loaded Image element |
| `imagenBaseIA` | AI-generated Image element (used as base for further adjustments) |
| `canvasResultadoIA` | Canvas with raw AI result (used for download) |
| `canvasProcesado` | Canvas with current processed result (HSL or AI) |
| `canvasOriginalData` | ImageData of original for brush restore mode |
| `configActual` | Current settings: hue, saturacion, colorHex, tolerancia, brillo, contraste |

## Key Patterns

### Download Logic
- **With AI result** (`canvasResultadoIA` exists): Downloads AI canvas directly without re-processing
- **Without AI**: Processes original through `imageProcessor.procesar()` at full resolution

### Brush Tool
- Two modes: `restaurar` (paint original pixels back) and `aplicar` (paint processed pixels)
- Syncs between split-view and full-view canvases

### Batch Processing
- **Automatic mode**: Processes all images sequentially with optional AI + rate limiting delay
- **Assisted mode**: Processes one-by-one, user reviews each before saving
- Uses File System Access API for direct folder read/write (fallback: ZIP download)
- Reference image: persists in `localStorage`, sent to Gemini for tone matching

## External Dependencies (CDN)

- Tailwind CSS (`cdn.tailwindcss.com`)
- Font Awesome 6.5.1
- JSZip 3.10.1 (for batch ZIP downloads)
- Google Fonts (Inter)

## LocalStorage Keys

| Key | Purpose |
|-----|---------|
| `fotosapp_gemini_key` | Gemini API key |
| `fotosapp_ultimo_color` | Last used color (hue, saturacion, colorHex) |
| `fotosapp_mis_colores` | User's saved color palette (array of hex, max 8) |
| `fotosapp_imagen_referencia` | Reference image base64 for batch tone consistency |
| `fotosapp_mockup_proveedor` | Mockup AI provider: `'gemini'` or `'openai'` |
| `fotosapp_openai_key` | OpenAI API key (mockup module) |
| `fotosapp_openai_calidad` | OpenAI quality: `'medium'` or `'high'` |

## Language

All code identifiers, UI text, variable names, and comments are in **Spanish**. Follow this convention.
