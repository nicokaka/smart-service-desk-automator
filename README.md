# Smart Service Desk Automator

> **Electron desktop application** that automates TomTicket service desk operations — from ticket creation and cataloging to AI-assisted batch resolution — boosting operator productivity and reducing manual effort.

[![Electron](https://img.shields.io/badge/Electron-40.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.58-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)

---

## Overview

The **Smart Service Desk Automator** is a native Windows desktop application built with Electron that integrates directly with the [TomTicket](https://www.tomticket.com/) REST API and Google Gemini AI to automate repetitive service desk workflows.

It implements a **dual-path architecture**: operations go through the REST API first (fast and reliable), with an automatic fallback to a Playwright-driven browser session when the API path is unavailable — ensuring continuity without manual intervention.

### Key Capabilities

| Feature | Description |
|---|---|
| **Ticket Queue** | Build and manage a batch creation queue with individually customizable entries |
| **Catalog Sync** | One-click sync of departments, categories, customers and operators from TomTicket API |
| **AI Ticket Generation** | Generates professional ticket descriptions from raw summaries using Gemini |
| **AI Solution Drafting** | Auto-writes closing messages for open tickets, editable before submission |
| **Batch Close** | Select and close multiple tickets in a single operation |
| **Browser Fallback** | Playwright-driven fallback for create/close when API token is unavailable |
| **Secure Credentials** | Sensitive data stored in the main process via Electron `safeStorage`, never in `localStorage` |

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│                    Electron Main Process           │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ tomticket_   │  │  ai_service  │  │  config-  │ │
│  │   api.js     │  │     .js      │  │ store.js  │ │
│  │              │  │              │  │           │ │
│  │ REST Client  │  │ Gemini 2.5   │  │ safeStore │ │
│  │ + Retry/     │  │ Flash +      │  │ Electron  │ │
│  │ Backoff      │  │ Model Cache  │  │ Keychain  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                │       │
│  ┌──────▼─────────────────▼────────────────▼─────┐ │
│  │                    main.js                    │ │
│  │      IPC Handlers + Operation Orchestrator    │ │
│  └──────────────────────┬────────────────────────┘ │
└─────────────────────────┼──────────────────────────┘
                          │ contextBridge (preload.js)
┌─────────────────────────▼───────────────────────────┐
│                  Renderer Process                   │
│   index.html + renderer.js + styles.css             │
│   Ticket Queue │ Open Manager │ Credentials │ Logs  │
└─────────────────────────────────────────────────────┘
```

### Design Decisions

- **Explicit operational contracts** — every API call returns a typed result (`success`, `partial`, `retryable_error`, `fatal_error`) via `operation-result.js`, making failure handling predictable and testable.
- **Retry with exponential backoff** — network errors (`ECONNRESET`, `ETIMEDOUT`, etc.) and transient HTTP codes (429, 502, 503…) trigger automatic retries with increasing delays.
- **AI model caching** — Gemini model instances are cached per API key/model pair to avoid redundant SDK initialization across batch operations.
- **Least-privilege renderer** — `contextIsolation: true`, `nodeIntegration: false`; the renderer communicates only through a minimal, whitelisted `preload.js` bridge.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Desktop Shell | Electron 40 |
| UI | HTML5 + Vanilla CSS |
| AI | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Browser Automation | Playwright 1.58 |
| Packaging | electron-builder (NSIS installer) |
| Testing | Node.js built-in test runner (`node --test`) |
| Config Security | Electron `safeStorage` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [TomTicket](https://www.tomticket.com/) account with an API token
- *(Optional)* A [Google Gemini API key](https://ai.google.dev/) for AI-assisted message generation

### Installation

```bash
git clone https://github.com/nicokaka/smart-service-desk-automator.git
cd smart-service-desk-automator
npm install
npm start
```

### First-time Setup

1. Open the **Credenciais** tab and enter your TomTicket API token and (optionally) your Gemini API key.
2. Click **Sincronizar Dados** to load departments, categories, customers, and operators.
3. Use **Fila de Chamados** to build the ticket queue or **Gerenciar Abertos** to manage existing tickets.

> Without an API token, create/close operations automatically fall back to a Playwright-driven browser session — as long as account credentials (login + password) are provided.

---

## Usage Modes

### Ticket Creation Queue

1. Add tickets to the queue with a client, department, category, and a brief summary.
2. Click **Gerar com IA** to auto-generate professional descriptions for all queued tickets.
3. Submit the queue — each ticket is created via the API (or browser fallback) and the result is logged per item.

### Batch Ticket Closing

1. Go to **Gerenciar Abertos** and click **Buscar Meus Chamados** to load your open tickets.
2. Select one or more tickets and click **Gerar Solução com IA** — Gemini drafts a closing message per ticket.
3. Review or edit each draft inline, then **Fechar Selecionados** to close them all in batch.

---

## Project Structure

```
.
├── main.js                # Main process — IPC handlers, orchestration
├── tomticket_api.js       # TomTicket REST client (retry, backoff, typed results)
├── ai_service.js          # Gemini AI integration (model cache, prompt templates)
├── bot.js                 # Playwright browser automation (fallback path)
├── bot-fallback-helpers.js# DOM helpers for browser fallback
├── config-store.js        # Secure credential storage (Electron safeStorage)
├── operation-result.js    # Typed result contracts (success/partial/error)
├── preload.js             # Minimal contextBridge API surface
├── renderer.js            # Renderer entry point
├── renderer/              # Modular renderer responsibilities
├── index.html             # Application UI
├── styles.css             # Application styles
├── tests/                 # Unit tests (Node built-in runner)
└── scripts/manual/        # Diagnostic utility scripts
```

---

## Testing

```bash
npm test
```

Tests cover:
- Renderer domain helpers
- Operational contract types (`operation-result.js`)
- Browser fallback critical paths (`bot-fallback-helpers.js`)

---

## Build & Distribution

```bash
# Windows installer (NSIS)
npm run dist:win

# Unpacked directory (for inspection)
npm run dist:dir
```

**Output artifacts:**
- `dist/Smart Service Desk Automator Setup 1.0.0.exe` — full Windows installer
- `dist/win-unpacked/` — portable unpacked app

The build excludes tests, manual scripts, and debug artifacts from the distributed bundle.

---

## Diagnostic Scripts

Utility scripts for manual API validation against a live TomTicket environment:

```bash
# List customers
npm run manual:customers

# List tickets
npm run manual:tickets:list

# Create a test ticket
npm run manual:tickets:create
```

> Requires `TOMTICKET_TOKEN` and `TOMTICKET_TEST_DEPARTMENT_ID` environment variables.

---

## Security

| Concern | Approach |
|---|---|
| Context isolation | `contextIsolation: true`, `nodeIntegration: false` |
| Credential storage | Main process only — Electron `safeStorage` (OS keychain) when available |
| Renderer cache | `localStorage` used exclusively for non-sensitive data (queue, catalogs) |
| IPC surface | `preload.js` exposes only explicitly whitelisted channels |
| Browser password | Only persisted when `saveCredentials` is explicitly enabled by the user |

---

## Known Limitations

- Browser fallback depends on the TomTicket portal DOM structure — layout changes may require selector updates.
- Tests are unit-level only; no E2E automation runs against the live TomTicket portal.
- Packaging currently targets Windows only (NSIS installer).

---

## Author

**Nicolas** — Building automation tools that bridge legacy service desk workflows with modern AI capabilities.

[![GitHub](https://img.shields.io/badge/GitHub-nicokaka-181717?logo=github&logoColor=white)](https://github.com/nicokaka)
