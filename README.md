<div align="center">

# Smart Service Desk Automator
### AI-Driven Ticket Management & Intelligent Triage

[🇺🇸 English](#-english) | [🇧🇷 Português](#-português)

</div>

---

<div id="-english"></div>

## 🇺🇸 English

> **Concept:** A Node.js automation agent designed to autonomously interact with Service Desk platforms (like TomTicket), leveraging **Playwright** for browser control and prepared for **AI** integration.

### 🚀 Overview
This project represents an advanced step in IT Infrastructure automation. Unlike simple client-side scripts, this is a **standalone server-side bot** capable of executing complex workflows in a headless environment.

It solves the bottleneck of manual ticket creation by automating the entire lifecycle: authenticating, navigating complex UI components (PrimeNG, iFrames), and populating technical details based on system logs.

### ⚙️ Key Features
* **Cross-Browser Core:** Built on **Playwright** to run seamlessly on Chromium, Firefox, and WebKit.
* **Intelligent API Sync:**
    * **Robust Data Fetching:** Automatically retrieves Departments, Categories, and Attendants, using fallback strategies to ensure data availability even if endpoints fail.
    * **Optimized Performance:** Implements throttled parallel requests to sync massive datasets up to 5x faster while respecting API rate limits.
* **Streamlined Workflow:**
    * **Queue Management:** Redesigned interface featuring bulk deletion and direct attendant assignment to speed up triage.
    * **Smart Bot Logic:** Enhanced automation that intelligently filters and selects dropdown options (using keyboard emulation) just like a human operator.
* **Complex UI Handling:**
    * **iFrame Injection:** Successfully interacts with Rich Text Editors (WYSIWYG) inside protected frames.
    * **Dynamic Dropdowns:** Handles non-standard UI libraries (PrimeNG) using keyboard emulation and event dispatching.
* **AI-Ready Architecture:** Designed to integrate with LLMs for automatic issue summarization and priority classification.

### 💻 Tech Stack
* **Runtime:** Node.js
* **Automation Framework:** Playwright (E2E)
* **Architecture:** Async/Await pattern with error handling
* **Security:** Environment variable management via `.env`

---

<div id="-português"></div>

## 🇧🇷 Português

> **Conceito:** Um agente de automação em Node.js projetado para interagir autonomamente com plataformas de Service Desk (como TomTicket), utilizando **Playwright** para controle do navegador e preparado para integração com **IA**.

### 🚀 Resumo
Este projeto representa um passo avançado na automação de Infraestrutura de TI. Diferente de scripts simples de navegador, este é um **bot autônomo (server-side)** capaz de executar fluxos de trabalho complexos.

Ele resolve o gargalo da criação manual de chamados, automatizando todo o ciclo: autenticação, navegação em componentes complexos de UI (PrimeNG, iFrames) e preenchimento de detalhes técnicos baseados em logs.

### ⚙️ Funcionalidades Principais
* **Núcleo Multi-Navegador:** Construído com **Playwright** para rodar em Chromium, Firefox e WebKit.
* **Sincronização Inteligente de API:**
    * **Busca Robusta de Dados:** Recupera automaticamente Departamentos, Categorias e Atendentes, usando estratégias de fallback para garantir dados mesmo se endpoints falharem.
    * **Performance Otimizada:** Implementa requisições paralelas controladas (throttling) para sincronizar grandes volumes de dados até 5x mais rápido, respeitando limites da API.
* **Fluxo de Trabalho Simplificado:**
    * **Gerenciamento de Fila:** Interface redesenhada com exclusão em massa e atribuição direta de atendentes para agilizar a triagem.
    * **Lógica de Bot Inteligente:** Automação aprimorada que filtra e seleciona opções de menus suspensos (usando emulação de teclado) exatamente como um operador humano.
* **Manipulação de UI Complexa:**
    * **Injeção em iFrames:** Interage com sucesso com Editores de Texto Rico dentro de frames protegidos.
    * **Dropdowns Dinâmicos:** Lida com bibliotecas de UI não padrão (PrimeNG) usando emulação de teclado.
* **Arquitetura Pronta para IA:** Projetado para integrar com LLMs para resumo automático de problemas e classificação de prioridade.

### 💻 Tecnologias
* **Runtime:** Node.js
* **Framework:** Playwright (E2E)
* **Arquitetura:** Padrão Async/Await com tratamento de erros
* **Segurança:** Gerenciamento de variáveis de ambiente via `.env`

---

<div align="center">

**Developed by Nícolas Oliveira de Araújo (nicokaka)**
<br>
IT Infrastructure Professional & Developer
<br>
[LinkedIn Profile](SEU_LINK_DO_LINKEDIN_AQUI)

</div>
