# Smart Service Desk Automator

🌐 **Language / Idioma:** [English](#english) · [Português](#português)

---

<a name="english"></a>

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

---

<a name="português"></a>

# Smart Service Desk Automator — Versão em Português

> **Aplicativo desktop Electron** que automatiza as operações de service desk no TomTicket — desde a criação de chamados e sincronização de catálogos até o encerramento em lote assistido por IA — aumentando a produtividade dos atendentes e reduzindo o esforço manual.

[![Electron](https://img.shields.io/badge/Electron-40.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.58-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Plataforma](https://img.shields.io/badge/Plataforma-Windows-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)

---

## Visão Geral

O **Smart Service Desk Automator** é um aplicativo desktop nativo para Windows, construído com Electron, que integra diretamente a [API REST do TomTicket](https://www.tomticket.com/) e o Google Gemini AI para automatizar fluxos repetitivos de service desk.

Ele implementa uma **arquitetura de duplo caminho**: as operações passam primeiro pela API REST (rápida e confiável), com fallback automático para uma sessão de navegador controlada pelo Playwright quando o caminho via API está indisponível — garantindo continuidade sem intervenção manual.

### Funcionalidades Principais

| Funcionalidade | Descrição |
|---|---|
| **Fila de Chamados** | Monte e gerencie uma fila de criação em lote com entradas individualmente configuráveis |
| **Sincronização de Catálogos** | Sincronize departamentos, categorias, clientes e atendentes da API TomTicket com um clique |
| **Geração de Chamados com IA** | Gera descrições técnicas profissionais a partir de resumos brutos usando o Gemini |
| **Rascunho de Solução com IA** | Redige automaticamente mensagens de encerramento para chamados abertos, editáveis antes do envio |
| **Fechamento em Lote** | Selecione e feche múltiplos chamados em uma única operação |
| **Fallback via Navegador** | Automação via Playwright para criação/fechamento quando o token de API não estiver disponível |
| **Credenciais Seguras** | Dados sensíveis armazenados no processo principal via `safeStorage` do Electron, nunca no `localStorage` |

---

## Arquitetura

```
┌────────────────────────────────────────────────────┐
│              Processo Principal (Main)             │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ tomticket_   │  │  ai_service  │  │  config-  │ │
│  │   api.js     │  │     .js      │  │ store.js  │ │
│  │              │  │              │  │           │ │
│  │ Cliente REST │  │ Gemini 2.5   │  │safeStorage│ │
│  │ + Retry/     │  │ Flash +      │  │ Electron  │ │
│  │ Backoff      │  │ Cache Modelo │  │ Keychain  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                │       │
│  ┌──────▼─────────────────▼────────────────▼─────┐ │
│  │                    main.js                    │ │
│  │     Handlers IPC + Orquestrador de Operações  │ │
│  └──────────────────────┬────────────────────────┘ │
└─────────────────────────┼──────────────────────────┘
                          │ contextBridge (preload.js)
┌─────────────────────────▼───────────────────────────┐
│                Processo Renderer                    │
│   index.html + renderer.js + styles.css             │
│  Fila de Chamados │ Gerenciar Abertos │ Credenciais │
└─────────────────────────────────────────────────────┘
```

### Decisões de Arquitetura

- **Contratos operacionais explícitos** — cada chamada de API retorna um resultado tipado (`success`, `partial`, `retryable_error`, `fatal_error`) via `operation-result.js`, tornando o tratamento de falhas previsível e testável.
- **Retry com backoff exponencial** — erros de rede (`ECONNRESET`, `ETIMEDOUT`, etc.) e códigos HTTP transientes (429, 502, 503…) disparam tentativas automáticas com intervalos crescentes.
- **Cache de modelos de IA** — instâncias do modelo Gemini são reutilizadas por par chave/modelo para evitar inicializações redundantes do SDK em operações em lote.
- **Renderer com privilégio mínimo** — `contextIsolation: true`, `nodeIntegration: false`; o renderer se comunica apenas por uma ponte `preload.js` com canais explicitamente autorizados.

---

## Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js (CommonJS) |
| Shell Desktop | Electron 40 |
| Interface | HTML5 + CSS Vanilla |
| IA | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Automação de Navegador | Playwright 1.58 |
| Empacotamento | electron-builder (instalador NSIS) |
| Testes | Runner nativo do Node.js (`node --test`) |
| Segurança de Config | Electron `safeStorage` |

---

## Como Começar

### Pré-requisitos

- Node.js 18+
- Uma conta no [TomTicket](https://www.tomticket.com/) com token de API
- *(Opcional)* Uma [chave de API do Google Gemini](https://ai.google.dev/) para geração de mensagens com IA

### Instalação

```bash
git clone https://github.com/nicokaka/smart-service-desk-automator.git
cd smart-service-desk-automator
npm install
npm start
```

### Configuração Inicial

1. Abra a aba **Credenciais** e insira seu token de API do TomTicket e, opcionalmente, a chave Gemini.
2. Clique em **Sincronizar Dados** para carregar departamentos, categorias, clientes e atendentes.
3. Use **Fila de Chamados** para montar a fila de abertura ou **Gerenciar Abertos** para gerenciar chamados existentes.

> Sem token de API, as operações de criação e fechamento usam automaticamente o fallback via Playwright — desde que as credenciais de login (conta, e-mail e senha) estejam preenchidas.

---

## Modos de Uso

### Fila de Criação de Chamados

1. Adicione chamados à fila com cliente, departamento, categoria e um resumo breve.
2. Clique em **Gerar com IA** para gerar descrições profissionais automaticamente para todos os chamados da fila.
3. Envie a fila — cada chamado é criado via API (ou fallback) e o resultado é registrado individualmente nos logs.

### Fechamento em Lote

1. Vá em **Gerenciar Abertos** e clique em **Buscar Meus Chamados** para carregar seus chamados em aberto.
2. Selecione um ou mais chamados e clique em **Gerar Solução com IA** — o Gemini rascunha uma mensagem de encerramento por chamado.
3. Revise ou edite cada rascunho diretamente na tela, e clique em **Fechar Selecionados** para encerrar todos em lote.

---

## Estrutura do Projeto

```
.
├── main.js                # Processo principal — handlers IPC, orquestração
├── tomticket_api.js       # Cliente REST TomTicket (retry, backoff, resultados tipados)
├── ai_service.js          # Integração Gemini AI (cache de modelo, templates de prompt)
├── bot.js                 # Automação via Playwright (caminho de fallback)
├── bot-fallback-helpers.js# Helpers DOM para o fallback via navegador
├── config-store.js        # Armazenamento seguro de credenciais (safeStorage)
├── operation-result.js    # Contratos de resultado tipados (success/partial/error)
├── preload.js             # Superfície mínima do contextBridge
├── renderer.js            # Entry point do renderer
├── renderer/              # Responsabilidades modulares do renderer
├── index.html             # Interface da aplicação
├── styles.css             # Estilos da aplicação
├── tests/                 # Testes unitários (runner nativo do Node)
└── scripts/manual/        # Scripts utilitários de diagnóstico
```

---

## Testes

```bash
npm test
```

Os testes cobrem:
- Helpers de domínio do renderer
- Contratos de resultado operacional (`operation-result.js`)
- Caminhos críticos do fallback via navegador (`bot-fallback-helpers.js`)

---

## Build e Distribuição

```bash
# Instalador Windows (NSIS)
npm run dist:win

# Diretório desempacotado (para inspeção)
npm run dist:dir
```

**Artefatos gerados:**
- `dist/Smart Service Desk Automator Setup 1.0.0.exe` — instalador completo para Windows
- `dist/win-unpacked/` — aplicativo portátil desempacotado

O build exclui testes, scripts manuais e artefatos de debug do bundle distribuído.

---

## Scripts de Diagnóstico

Scripts utilitários para validação manual contra um ambiente TomTicket real:

```bash
# Listar clientes
npm run manual:customers

# Listar chamados
npm run manual:tickets:list

# Criar chamado de teste
npm run manual:tickets:create
```

> Requer as variáveis de ambiente `TOMTICKET_TOKEN` e `TOMTICKET_TEST_DEPARTMENT_ID`.

---

## Segurança

| Aspecto | Abordagem |
|---|---|
| Isolamento de contexto | `contextIsolation: true`, `nodeIntegration: false` |
| Armazenamento de credenciais | Processo principal — `safeStorage` do Electron (keychain do SO) quando disponível |
| Cache do renderer | `localStorage` usado exclusivamente para dados não sensíveis (fila, catálogos) |
| Superfície IPC | `preload.js` expõe apenas canais explicitamente autorizados |
| Senha do navegador | Persistida somente quando `saveCredentials` é ativado pelo usuário |

---

## Limitações Conhecidas

- O fallback via navegador depende da estrutura DOM do portal TomTicket — mudanças de layout podem exigir atualização dos seletores.
- Os testes atuais são unitários; não há automação E2E real contra o portal externo.
- O empacotamento suporta apenas Windows (instalador NSIS).

---

## Autor

**Nicolas** — Desenvolvendo ferramentas de automação que conectam fluxos de service desk legados com capacidades modernas de IA.

[![GitHub](https://img.shields.io/badge/GitHub-nicokaka-181717?logo=github&logoColor=white)](https://github.com/nicokaka)

