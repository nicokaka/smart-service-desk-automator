# Smart Service Desk Automator

Aplicativo Electron para operacao interna com dois caminhos principais:

- integracao direta com a API do TomTicket
- fallback via navegador com Playwright quando o modo API nao puder ser usado

## Estado Atual

- `renderer` modularizado por responsabilidade
- `preload` exposto com API minima e explicita
- segredos sensiveis nao ficam mais persistidos no `localStorage` do renderer
- configuracoes sensiveis ficam no processo principal via `config-store.js`, usando `safeStorage` do Electron quando disponivel
- contratos operacionais retornam estados explicitos como `success`, `partial`, `retryable_error` e `fatal_error`

## Desenvolvimento

```bash
npm install
npm start
npm test
```

## Build

```bash
npm run dist:win
npm run dist:dir
```

O build exclui testes automatizados, scripts manuais e artefatos de debug que nao fazem parte do app distribuido.

## Scripts Manuais

Scripts utilitarios de diagnostico foram movidos para `scripts/manual/`:

- `npm run manual:customers`
- `npm run manual:tickets:list`
- `npm run manual:tickets:create`

Esses scripts dependem de variaveis de ambiente como `TOMTICKET_TOKEN` e escrevem saidas temporarias em `scripts/manual/output/`.

## Seguranca e Armazenamento

- `contextIsolation: true`
- `nodeIntegration: false`
- ponte `preload.js` restrita a chamadas whitelisted
- token TomTicket, senha e chave Gemini sao armazenados no processo principal, nao no `localStorage` do renderer
- cache operacional do renderer ainda usa `localStorage` apenas para fila e catalogos nao sensiveis

## Observacoes

- o fallback via navegador continua dependente do layout externo do portal
- os testes atuais sao unitarios e de helpers; nao ha E2E real contra o portal externo
