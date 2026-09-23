---
trigger: always_on
description: "Regras de Negócio e Operação Hebron / TomTicket Service Desk"
---

# Regras de Negócio e Operação Hebron - TomTicket Service Desk

> Este documento define as regras mandatórias de negócio, mapeamento de cadastros e padrões de automação para chamados da operação Hebron / TomTicket.

---

## 🏢 1. Roteamento de Departamento e Categorias

- **Departamento Comercial (MANDATÓRIO):**
  - **Regra:** Tudo que envolver propagandistas, representantes de vendas, carteiras médicas, contatos de médicos e sistema Hebronline pertence **exclusivamente ao departamento Comercial**.
  - **Department ID:** `fc9bb40c65140856ee602d18d57fe1a8` (`Comercial`)

- **Categoria de Serviço Padrão:**
  - **Transferências, Reativações e Manutenção de Carteira Médica:**
    - Categoria: `Hebronline - Atualização de contato`
    - **Category ID:** `72b25891b72a0564ab10aa82f1c0ce32`

---

## 👤 2. Operador e Atribuição

- **Operador Responsável:** `Nicolas`
  - **Operator ID:** `fe8dc3260c21acdc15548a3a2d17bc70`
  - **Regra:** Todo chamado aberto ou automatizado deve ser imediatamente vinculado ao operador Nicolas via endpoint `/ticket/operator/link`.

---

## 👥 3. Cadastro de Novos Solicitantes / Clientes

- **Organização Padrão:** Se o solicitante (cliente) não possuir cadastro prévio no TomTicket, deve ser criado vinculado à organização **HEBRON**.
- **Senha Padrão Institucional:** `Hebron@2026`
- **Mapeamento de E-mail:** Na criação de chamados via API, caso o ID numérico do cliente seja nulo no catálogo, utilize o e-mail com `customer_id_type = "E"`.

---

## 🤖 4. Padrão TomTicket de Fechamento por IA (Gemini)

Ao redigir mensagens de solução/encerramento para os chamados:
1. **Anonimato do Solicitante (CRÍTICO):**
   - Use **APENAS** as expressões *"o cliente"* ou *"o usuário"*.
   - **NUNCA** inclua o nome próprio da pessoa solicitante no texto da solução.
2. **Palavras Proibidas (CRÍTICO):**
   - **NUNCA** inclua a frase *"Chamado finalizado."* (trata-se de status de sistema, proibido no corpo da mensagem).
3. **Estilo Humanizado e Técnico:**
   - Tom: Direto, técnico e profissional em português do Brasil.
   - Descreva a ação resolutiva executada (ex: transferência de carteira realizada, cadastro reativado com sucesso).
   - Elimine clichês de IA (ex: *"esperamos ter ajudado"*, *"estamos à disposição"*).

---

## ⚙️ 5. Configuração Técnica Crítica da IA (Gemini 2.5 Flash)

- **Thinking Tokens (Reasoning):**
  - O modelo `gemini-2.5-flash` consome tokens internos de raciocínio silencioso (`thoughtsTokenCount`), que contam para o `maxOutputTokens`.
  - **MANDATÓRIO:** O parâmetro `maxOutputTokens` em `ai_service.js` deve ser mantido em **no mínimo 2048** (nunca 600), para evitar que a resposta JSON seja truncada com `finishReason: MAX_TOKENS`.

---

## 🖥️ 6. Execução Headless via Electron

- O aplicativo utiliza `safeStorage` do Electron para criptografar tokens e chaves em `config-store.json`.
- Para scripts de automação em linha de comando / headless:
  - Devem ser executados através de `npx electron <script.js>`.
  - O caminho de dados deve ser explicitamente apontado antes de carregar as configurações:
    ```javascript
    const { app } = require("electron");
    app.setPath("userData", path.join(process.env.APPDATA, "tomticketbot"));
    ```
- **Intervalo de Segurança (Throttling):** Respeite uma pausa de 1200ms a 2000ms entre chamadas consecutivas para prevenir erros de limite de taxa (`HTTP 429`).
