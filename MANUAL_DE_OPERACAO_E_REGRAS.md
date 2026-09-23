# 📖 Manual de Operação e Diretrizes de Engenharia - TomTicket BOT (Hebron)

> **Documento Oficial de Registro de Conhecimento, Regras Operacionais e Padrões de Automação.**  
> Criado para consulta perene por operadores, analistas de Service Desk e futuros desenvolvedores do projeto.

---

## 🎯 1. Visão Geral da Operação

O **TomTicket BOT** é uma ferramenta de automação para o Service Desk da Hebron, projetada para:
1. Sincronizar catálogos (departamentos, categorias, clientes e operadores).
2. Processar criação de chamados em lote (via planilha Excel/TSV/CSV ou dossiê estruturado).
3. Atribuir operadores automaticamente.
4. Elaborar mensagens técnicas de resolução humanizadas utilizando o **Google Gemini 2.5 Flash**.
5. Finalizar os chamados de ponta a ponta na API do TomTicket, sem necessidade de operação manual repetitiva na interface gráfica.

---

## 🏢 2. Regras de Negócio Mandatórias (Hebron)

### A. Roteamento de Departamento
- **Regra Fundamental:** Toda demanda relacionada a propagandistas, força de vendas, cadastro/manutenção de médicos, carteiras e sistema Hebronline pertence **ao departamento Comercial**.
- **Nome do Departamento:** `Comercial`
- **ID do Departamento:** `fc9bb40c65140856ee602d18d57fe1a8`

### B. Categorização Padrão
- **Transferências, Reativações e Correções de Carteiras Médicas:**
  - **Categoria:** `Hebronline - Atualização de contato`
  - **ID da Categoria:** `72b25891b72a0564ab10aa82f1c0ce32`

### C. Operador / Atendente Oficial
- **Operador Padrão:** `Nicolas`
- **ID do Operador:** `fe8dc3260c21acdc15548a3a2d17bc70`
- **Regra:** Todo chamado criado pela automação deve ser imediatamente atribuído ao operador Nicolas antes de sua finalização.

### D. Cadastro de Novos Usuários / Solicitantes
- Se um solicitante (médico, propagandista ou analista) não estiver cadastrado no catálogo do TomTicket:
  - **Organização:** `HEBRON`
  - **Senha Padrão:** `Hebron@2026`
  - **Identificador de Criação na API:** Caso o cliente não possua `id` numérico, envie o e-mail corporativo com o parâmetro `customer_id_type = "E"`.

---

## 🤖 3. Padrão TomTicket de Fechamento por IA (Gemini)

Para manter a consistência com o histórico de atendimento do operador Nicolas no TomTicket, os textos de solução técnica devem seguir rigorosamente o padrão:

1. **Anonimato do Solicitante (Regra de Ouro):**
   - **NUNCA** citar o nome da pessoa solicitante na mensagem de solução.
   - Use **SEMPRE** *"o cliente"* ou *"o usuário"*.
   - *Exemplo correto:* *"A reativação cadastral foi concluída conforme a solicitação do cliente."*
   - *Exemplo incorreto:* *"A reativação solicitada pela Janaina foi realizada."*

2. **Palavras e Frases Proibidas:**
   - **NUNCA** incluir `"Chamado finalizado."` no corpo da mensagem. Essa frase é um status de sistema exibido pela plataforma e sua inclusão na mensagem soa redundante.

3. **Humanização e Tom Técnico:**
   - Redação direta, concisa, em português brasileiro correto.
   - Especificar a ação executada (ex.: CRM do médico, setor de origem/destino, número de registros homologados).
   - Zero enrolação, sem introduções teatrais ou saudações excessivas (ex.: eliminar *"Espero ter ajudado"*, *"Estamos à disposição"*).

---

## ⚙️ 4. Descobertas Técnicas e Arquitetura

### A. Resolução do Limite de Tokens no Gemini 2.5 Flash (Thinking Tokens)
- **Problema Detectado:** O modelo `gemini-2.5-flash` utiliza tokens internos silenciosos de raciocínio (*thoughtsTokenCount*), consumindo cerca de 800 tokens antes de emitir a resposta. Como o `maxOutputTokens` em `ai_service.js` estava configurado em `600`, a resposta era abortada prematuramente com `finishReason: MAX_TOKENS`, gerando JSON corrompido (`Unterminated string`).
- **Solução Implementada:** O `maxOutputTokens` foi atualizado para **`2048`** em `ai_service.js`. Com isso, o modelo raciocina livremente e gera 100% do payload JSON com `finishReason: STOP`.

### B. Execução Headless com Electron safeStorage
- Os tokens da API TomTicket e a API Key do Gemini ficam criptografados pelo DPAPI do Windows via `safeStorage` em `config-store.json`.
- Scripts de linha de comando que acessam essas credenciais devem:
  1. Ser disparados via `npx electron <script.js>`.
  2. Configurar explicitamente o diretório de dados antes da leitura:
     ```javascript
     const { app } = require("electron");
     app.setPath("userData", path.join(process.env.APPDATA, "tomticketbot"));
     ```

### C. Rate Limiting e Prevenção de Erro 429
- A API do TomTicket e a API do Gemini respondem com alto desempenho quando há um espaçamento de **1200ms a 2000ms** entre cada requisição.
- Todos os scripts de lote devem utilizar um delay de 1.5s entre etapas para assegurar 100% de taxa de sucesso sem bloqueios temporários.

---

## 📊 5. Histórico da Execução do Dossiê Hebronline (23/09/2026)

- **Total de Chamados:** 34
- **Chamados Processados e Encerrados:** **33** (Protocolos `5078` a `5112`)
- **Chamados em Standby:** **1** (Chamado 02 - Dr. Gustavo Pinheiro Torres / Solicitante Felipe, aguardando confirmação cadastral)
- **Falhas / Rejeições:** **0**
- **Relatório Completo com IDs:** Consulte [relatorio_execucao_34_chamados.md](file:///C:/Users/nicolas/.gemini/antigravity-ide/brain/4a864667-e120-4845-a6d4-7fe2f9fc9bca/relatorio_execucao_34_chamados.md) ou no diretório de scratch do projeto.
