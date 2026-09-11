# 🏛️ DIAGNÓSTICO TÉCNICO DE ENGENHARIA & PLANO DE EVOLUÇÃO
**Projeto:** Smart Service Desk Automator (TomTicketBOT)  
**Perfil de Análise:** Engenheiro de Software Principal / Dev Sênior de Elite  
**Data:** 08/09/2026 | **Versão Base:** 1.1.0  
**Stack:** Electron 40.6, Node.js, Playwright, Google Gemini API, Vanilla ES Modules, Vanilla CSS  

---

## 🎯 Sumário Executivo

O **Smart Service Desk Automator** é um projeto com excelentes fundamentos arquiteturais: separação clara entre Main e Renderer via Context Isolation, isolamento isomórfico de regras de negócio em `shared/domain.js`, criptografia nativa de credenciais via `safeStorage` (DPAPI/Keychain) e suíte de 88 testes unitários automatizados passando com 100% de sucesso.

Contudo, uma análise aprofundada de **engenharia de confiabilidade, usabilidade e concorrência** revela **falhas de estado críticas** (como perda de trabalho gerado por IA ao filtrar telas), **gargalos de I/O síncrono** (gravações desnecessárias a cada tecla digitada), **riscos de estouro de quota** no navegador com bases corporativas e **limitações estruturais no fallback de RPA**.

Este documento cataloga rigorosamente todos os problemas identificados, analisa potenciais falhas adicionais e estabelece uma rota clara de modernização técnica para transformar a aplicação em uma ferramenta de nível industrial.

---

## 🗺️ Mapa de Calor dos Problemas e Oportunidades

| Domínio | Criticidade | Problemas Identificados | Potencial de Melhoria |
| :--- | :---: | :--- | :--- |
| **1. Gestão de Estado & Concorrência** | 🔴 ALTA | 4 bugs críticos de UI e concorrência | Implementar Store Reativa e State Machine local |
| **2. Integração com TomTicket API** | 🟠 MÉDIA-ALTA | Paginação ambígua, ausência de throttle e `Retry-After` | Cliente HTTP resiliente com Token Bucket e paginação robusta |
| **3. Serviço de Inteligência Artificial** | 🟠 MÉDIA-ALTA | Duplo loop de retries, falta de `temperature`, regex frágil | Configuração determinística (`temp: 0.2`), guardas JSON e circuit breaker |
| **4. RPA / Fallback Navegador** | 🟠 MÉDIA-ALTA | Cancelamento ineficaz, dependência de binários Playwright | Suporte a Chrome local instalado via `--channel=chrome`, cancelamento cooperativo |
| **5. Performance, I/O & Armazenamento** | 🟡 MÉDIA | `localStorage` limitado a 5MB, debounce ausente em inputs | Persistência de catálogo em arquivo no Main, Debounce de 300ms na fila |
| **6. Segurança & Empacotamento** | 🟡 MÉDIA | `.agent/` embutido no instalador, drag-and-drop desprotegido | Exclusão de arquivos dev no build, guardas `will-navigate`, atomic file write |
| **7. UX, Ergonomia & Produtividade** | 🔵 BAIXA-MÉDIA | Labels sem `for`, falta de importação CSV, sem atalhos | Importador CSV/Excel, botão "Reprocessar Falhas", atalhos de teclado |

---

## 🔴 SEÇÃO 1: BUGS CRÍTICOS DE LÓGICA E PERDA DE ESTADO

### 1.1. Perda Total das Soluções de IA ao Filtrar por Atendente no Gerenciador
* **Arquivos Afetados:** [`renderer/manager-controller.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/manager-controller.mjs#L134-L146)
* **Causa Raiz:** Em `handleGenerateSolutions`, a resposta da IA é escrita exclusivamente no DOM:
  ```javascript
  solutionInput.value = parsed?.solucao || aiResponse.data;
  ```
  O array em memória `allTickets` não é sincronizado. Quando o atendente altera o dropdown `operatorFilter`, a função `handleOperatorFilter` chama `renderTickets(ticketsFiltrados)`, que executa:
  ```javascript
  elements.tableBody.innerHTML = "";
  ```
  destruindo o DOM anterior e reconstruindo as linhas a partir de `allTickets`.
* **Impacto:** Todas as soluções geradas por IA (que consumiram tempo, tokens da Google e requisições) são apagadas silenciosamente.
* **Solução Técnica:**
  1. Manter as soluções no modelo de dados: ao receber o retorno da IA, atualizar `const ticket = allTickets.find(t => t.id === row.dataset.id); if (ticket) ticket.solution = solucao;`.
  2. Em `renderTickets`, preencher o `<textarea class="input-solution">` com `escapeHtml(ticket.solution || "")`.
  3. Adicionar listener de `input` no `<textarea>` para que alterações manuais do técnico também sincronizem de volta no objeto `ticket`.

---

### 1.2. Inoperância do Botão "Cancelar" no Modo Contingência (Playwright RPA)
* **Arquivos Afetados:** [`main.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/main.js#L567-L588), [`bot.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/bot.js#L602-L631)
* **Causa Raiz:** O token de cancelamento (`createCancelToken`) só é instanciado e consumido dentro do fluxo HTTP da API REST. Quando a aplicação entra em fallback por navegador (`runBot`), a função `runBot` é disparada diretamente sem receber o `cancelToken`. O loop `processTickets` em `bot.js` não possui verificação cooperativa de cancelamento.
* **Impacto:** O usuário clica em "⏹ Cancelar", o IPC emite o sinal, mas o navegador continua abrindo páginas, clicando e processando todo o lote em segundo plano.
* **Solução Técnica:**
  1. Criar o `cancelToken` antes de decidir se a rota é API ou Bot.
  2. Passar o token para `runBot(tickets, credentials, runtime, cancelToken)`.
  3. No loop `processTickets` de `bot.js`:
     ```javascript
     if (cancelToken?.requested) {
       logger.log("[BOT] Operação abortada a pedido do usuário.");
       break;
     }
     ```

---

### 1.3. Re-submissão Indesejada de Chamados Já Fechados
* **Arquivos Afetados:** [`renderer/manager-controller.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/manager-controller.mjs#L384-L391)
* **Causa Raiz:** Na conclusão com sucesso de `handleCloseSelected`, o código desabilita apenas os campos textuais:
  ```javascript
  $$("input:not([type='checkbox']), textarea", row).forEach((input) => {
    input.disabled = true;
  });
  ```
  O checkbox da linha (`.manager-check`) permanece marcado (`checked = true`) e habilitado (`disabled = false`).
* **Impacto:** Se o usuário clicar novamente em "Fechar Selecionados" para processar outros itens ou por engano, os chamados já encerrados são reenviados para a API.
* **Solução Técnica:**
  ```javascript
  const checkbox = $(".manager-check", row);
  if (checkbox) {
    checkbox.checked = false;
    checkbox.disabled = true;
  }
  ```

---

### 1.4. Condição de Corrida Visual: Manipulação da Fila Durante Processamento
* **Arquivos Afetados:** [`renderer/queue-controller.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/queue-controller.mjs#L474-L478)
* **Causa Raiz:** Ao clicar em "▶ Iniciar Bot" ou "✨ Gerar com IA", apenas o botão acionado entra em estado ocupado (`setButtonBusy`). Os botões `+ Adicionar Linha`, `Excluir Selecionados` e o checkbox mestre `select-all` permanecem clicáveis.
* **Impacto:** Se o operador excluir linhas durante a execução, o DOM é alterado. As respostas assíncronas do IPC chegam buscando a linha por `findRowById(documentRef, item.id)`, não encontram o elemento, perdem o status e quebram a coerência do relatório final.
* **Solução Técnica:**
  Criar um helper de bloqueio global de fila:
  ```javascript
  function setQueueControlsDisabled(disabled) {
    elements.addRowButton.disabled = disabled;
    elements.removeSelectedButton.disabled = disabled;
    elements.selectAllCheckbox.disabled = disabled;
    elements.generateAiButton.disabled = disabled;
  }
  ```
  Acionar no início do processamento e liberar no `finally`.

---

## 🟠 SEÇÃO 2: RESILIÊNCIA DE REDE, APIS E ARMAZENAMENTO

### 2.1. Quota de 5MB do `localStorage` Estourada por Catálogo Corporativo
* **Arquivos Afetados:** [`renderer/runtime-settings.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/runtime-settings.mjs#L160-L201)
* **Diagnóstico de Engenharia:**
  O método `saveCatalogSnapshot` armazena `snapshot.fullCustomers` via `localStorage.setItem`. Cada objeto de cliente contém IDs, nomes, e-mails e metadados. Uma base com 3.000 a 10.000 clientes facilmente ultrapassa o teto rígido de **5MB** do `localStorage` do Chromium.
  O bloco `safeSetItem` intercepta a exceção e silencia o erro com `console.error`. O catálogo não grava. Ao reabrir o app, o catálogo de clientes está vazio, forçando um novo sync que falhará novamente ao tentar persistir.
* **Solução Técnica:**
  Mover a persistência do catálogo pesado para o **Processo Main do Electron**:
  1. Criar canal IPC `catalog:save-cache` e `catalog:load-cache`.
  2. Gravar em arquivo JSON local via Node.js Stream em `path.join(app.getPath("userData"), "catalog-cache.json")`.
  3. No `localStorage`, manter apenas preferências leves de UI (tema, aba ativa).

---

### 2.2. Ambiguidade na Paginação da TomTicket API v2
* **Arquivos Afetados:** [`tomticket_api.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/tomticket_api.js#L306-L308)
* **Diagnóstico de Engenharia:**
  Em `getTickets`, a condição de quebra do loop de páginas é:
  ```javascript
  if (
    pageResult.data.length === 0 ||
    pageResult.meta?.payload?.next_page === null ||
    pageResult.meta?.payload?.next_page === undefined
  ) {
    break;
  }
  ```
  Na TomTicket API, determinados endpoints ou retornos de clientes não incluem o atributo `next_page` no payload (ou retornam diretamente `{ erro: false, data: [...] }`). Como `next_page` é `undefined`, a condição é satisfeita na **Página 1**, e o sistema encerra a listagem sem buscar as páginas subsequentes.
  *(Curiosamente, na mesma biblioteca, a função `getCustomers` checa apenas `=== null`, comprovando a inconsistência interna).*
* **Solução Técnica:**
  Interromper a paginação apenas se:
  1. O array de dados retornado vier vazio (`data.length === 0`), OU
  2. O número de registros na página for menor que o limite solicitado (ex: `< 100`), OU
  3. `next_page` existir e for explicitamente `null` ou `false`.

---

### 2.3. Duplo Loop de Retries Conflitante na Geração de IA
* **Arquivos Afetados:** [`ai_service.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/ai_service.js#L217-L225) vs [`renderer/queue-controller.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/queue-controller.mjs#L670-L683)
* **Diagnóstico de Engenharia:**
  1. No Main, `ai_service.js` já executa até 3 retentativas para HTTP 429 com backoff de 2s, 4s e 8s.
  2. Quando ele esgota as tentativas e rejeita a Promise, o Renderer em `queue-controller.mjs` intercepta o erro e dispara um **segundo loop** de retentativa de até 3 vezes com esperas de 30s, 60s e 120s.
  3. A cada ciclo do Renderer, o Main roda novamente seus 3 retries internos.
* **Impacto:** Se uma chave atinge cota diária (esgotamento de cota, não rate-limit passageiro), o sistema fica travado por **mais de 3 minutos por linha**. Uma fila de 10 chamados pode ficar congelada por meia hora.
* **Solução Técnica:**
  - Centralizar a gestão de backoff **exclusivamente no `ai_service.js`**.
  - No Renderer, se a chamada de IA falhar com erro irrecuperável de cota, parar o lote imediatamente, exibir Toast de alerta e liberar a interface.

---

### 2.4. Sincronização em Rajada de Categorias sem Intervalo de Segurança
* **Arquivos Afetados:** [`main.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/main.js#L483-L493)
* **Diagnóstico de Engenharia:**
  No `catalog:sync`, para cada departamento retornado, é disparada uma chamada `getCategories(token, department.id)` sequencial sem nenhum intervalo (`sleep`). Se a empresa possuir 30 departamentos, são 30 requisições disparadas em fração de segundo.
* **Solução Técnica:**
  Adicionar uma pausa preventiva de 100ms a 150ms entre cada iteração no loop de categorias para respeitar o rate-limit da TomTicket.

---

### 2.5. Ausência de Leitura do Header `Retry-After` na TomTicket API
* **Arquivos Afetados:** [`tomticket_api.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/tomticket_api.js#L209-L213)
* **Diagnóstico de Engenharia:**
  Ao receber HTTP 429, o cliente calcula um atraso estático (`backoffMs * attempt`). Caso o servidor envie o cabeçalho padrão `Retry-After: 30`, o cliente ignora a instrução do servidor e tenta novamente em 1 ou 2 segundos, resultando em novo bloqueio imediato.
* **Solução Técnica:**
  Inspecionar `response.headers['retry-after']` e aguardar o tempo solicitado pelo servidor antes de retentar.

---

## 🟡 SEÇÃO 3: SEGURANÇA, EMPACOTAMENTO E MODELOS DE IA

### 3.1. Vazamento da Pasta de Desenvolvimento `.agent/` no Pacote de Produção
* **Arquivos Afetados:** [`package.json`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/package.json#L22-L32)
* **Diagnóstico:** A configuração do `electron-builder` em `build.files` exclui testes e scripts manuais, mas não exclui a pasta `.agent/**`. Toda a suíte de automação com dezenas de scripts Python e regras de agentes (~20MB) é empacotada no executável de distribuição do usuário.
* **Solução Técnica:**
  Adicionar `"!agent{,/**}"` e `"!.agent{,/**}"` na lista de exclusão do `package.json`.

---

### 3.2. Falha de Execução do Playwright em Ambientes sem Node/DevTools
* **Arquivos Afetados:** [`bot.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/bot.js#L281-L309)
* **Diagnóstico:** Em máquinas de clientes comuns onde o Playwright nunca foi instalado via terminal, os binários de Chromium em `%LOCALAPPDATA%\ms-playwright` não existem. O fallback de RPA falha com erro de executável não encontrado.
* **Solução Técnica:**
  Configurar o Playwright para utilizar o navegador Google Chrome já instalado nativamente no Windows do usuário, passando a flag de canal:
  ```javascript
  browser = await engines.chromium.launch({
    headless: isHeadless(credentials),
    channel: "chrome", // Utiliza o Chrome nativo do sistema do usuário
  });
  ```

---

### 3.3. Configuração de Temperatura e Limite de Tokens no Gemini
* **Arquivos Afetados:** [`ai_service.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/ai_service.js#L41-L46)
* **Diagnóstico:** O modelo é instanciado sem parâmetros de `temperature` e `maxOutputTokens`:
  ```javascript
  const model = genAI.getGenerativeModel({
    model: targetModel,
    generationConfig: { responseMimeType: "application/json" },
  });
  ```
  Sem temperatura explícita, o Gemini utiliza o padrão de criatividade (~1.0), gerando variações indesejadas em chamados técnicos de suporte.
* **Solução Técnica:**
  Definir hiperparâmetros determinísticos:
  ```javascript
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.2,       // Alta precisão e determinismo para TI
    maxOutputTokens: 600,   // Evita respostas excessivamente longas e economiza tokens
  }
  ```

---

### 3.4. Escrita Não-Atômica no Arquivo de Configurações
* **Arquivos Afetados:** [`config-store.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/config-store.js#L71-L75)
* **Diagnóstico:** `writeStoreFile` utiliza `fs.writeFileSync(filePath, ...)`. Se a máquina desligar abruptamente ou a aplicação for fechada no milissegundo da escrita, o arquivo pode ficar truncado com 0 bytes, corrompendo as configurações do usuário.
* **Solução Técnica:**
  Gravar em arquivo temporário (`config-store.json.tmp`) e aplicar substituição atômica via `fs.renameSync`.

---

### 3.5. Proteção contra Navegação Indesejada e Drag-and-Drop
* **Arquivos Afetados:** [`main.js`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/main.js#L359-L373)
* **Diagnóstico:** A janela do Electron bloqueia `setWindowOpenHandler`, mas não intercepta o evento `will-navigate`. Se um usuário arrastar um arquivo ou URL para dentro da janela, o Electron pode navegar para fora da SPA local.
* **Solução Técnica:**
  ```javascript
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    event.preventDefault();
  });
  ```

---

## 🔵 SEÇÃO 4: USABILIDADE, ERGONOMIA E PRODUTIVIDADE (UX/UI)

### 4.1. I/O Síncrono Bloqueante a Cada Tecla Digitada
* **Arquivos Afetados:** [`renderer/queue-controller.mjs`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/renderer/queue-controller.mjs#L250-L254)
* **Diagnóstico:** O evento `input` de cada campo de texto da fila chama `saveCurrentQueueState()`. Essa função varre todas as linhas da tabela, busca elementos no DOM, serializa o JSON completo da fila e grava sincronamente no `localStorage` a **cada caractere digitado**. Em tabelas com dezenas de chamados, a digitação apresenta lag perceptível.
* **Solução Técnica:**
  Implementar **Debounce de 300ms** na chamada de persistência:
  ```javascript
  let saveTimeout;
  function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentQueueState, 300);
  }
  ```

---

### 4.2. Acessibilidade: Rótulos sem Vínculo com Inputs
* **Arquivos Afetados:** [`index.html`](file:///c:/Users/nicolas/.gemini/antigravity/scratch/TomTicketBOT/index.html#L167-L287)
* **Diagnóstico:** Os `<label>` de configurações não possuem atributos `for`.
* **Solução Técnica:**
  Vincular semanticamente os rótulos (`<label for="settings-account">`, `<label for="apiToken">`, etc.).

---

### 4.3. Falta de Recurso para Importação em Massa (CSV / Clipboard)
* **Oportunidade de Alto Impacto:**
  Técnicos frequentemente possuem planilhas com dezenas de chamados diários para abrir. Ter que clicar em "+ Adicionar Linha" e preencher um por um gera fricção.
* **Melhoria Proposta:**
  Criar um botão **"📂 Importar CSV / Colar Planilha"** que interpreta dados separados por vírgula ou tabulação (copiados direto do Excel) e preenche automaticamente as linhas da fila.

---

### 4.4. Botão "Reprocessar Apenas Falhas"
* **Oportunidade de Alto Impacto:**
  Quando um lote de 20 chamados termina com 2 falhas (por oscilação temporária de rede ou campo incorreto), o técnico precisa desmarcar manualmente os 18 que deram certo para reenviar os 2 que falharam.
* **Melhoria Proposta:**
  Adicionar botão inteligente ou ação no toast: **"Selecionar apenas falhas"** para reprocessamento imediato em 1 clique.

---

### 4.5. Atalhos de Teclado Globais para Produtividade
* **Melhoria Proposta:**
  - `Ctrl + N`: Nova linha na fila.
  - `Ctrl + Enter`: Iniciar processamento do lote.
  - `Escape`: Fechar modais ou cancelar operação em andamento.

---

## 🛠️ Plano de Ação & Roadmap de Implementação

```
FASE 1: CONFIABILIDADE E CORREÇÃO DE ESTADO [CONCLUÍDA ✅]
├── [Bug 1.1] Sincronizar soluções de IA com allTickets para não perder textos ao filtrar [OK]
├── [Bug 1.2] Passar cancelToken para o Playwright (runBot) [OK]
├── [Bug 1.3] Desmarcar e desabilitar checkboxes de chamados concluídos com sucesso [OK]
├── [Bug 1.4] Desabilitar botões da fila (+Linha, Excluir) durante execução de lote [OK]
└── [Build 3.1] Excluir pasta .agent do electron-builder no package.json [OK]

FASE 2: RESILIÊNCIA DE REDE, PERFORMANCE E IA [CONCLUÍDA ✅]
├── [Perf 2.1] Debounce de 300ms no saveCurrentQueueState da fila [OK]
├── [AI 2.3] Unificar retries de IA eliminando duplo loop travante no Renderer [OK]
├── [AI 3.3] Calibrar Gemini com temperature: 0.2 e maxOutputTokens: 600 [OK]
├── [API 2.2] Robustecer condição de parada da paginação de tickets [OK]
├── [API 2.4] Throttle de 100ms na busca de categorias por departamento [OK]
└── [Main 3.5] Bloqueio do evento will-navigate para segurança contra drag-and-drop [OK]

FASE 3 & 4: ARQUITETURA, ACESSIBILIDADE E PRODUTIVIDADE OPERACIONAL [CONCLUÍDA ✅]
├── [Arch 5.1] Migração de catálogo para disco (catalog-store.js via userData) com escrita atômica [OK]
├── [UX 4.2] Adicionar atributos 'for' nos labels de formulário [OK]
├── [UX 4.4] Botão inteligente "Reprocessar Apenas Falhas" [OK]
├── [Feature 4.3] Importador de planilha / colar do Excel (TSV/CSV com fuzzy match) [OK]
└── [UX 4.5] Atalhos de teclado (Ctrl+N, Ctrl+Enter, Esc) [OK]
```

---

> 📄 **Status:** Todas as 4 fases foram integralmente implementadas e aprovadas com **101 testes automatizados passando (100% de sucesso)**.

