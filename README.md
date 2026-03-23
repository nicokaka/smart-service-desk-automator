# Smart Service Desk Automator

Aplicativo Electron para operacao interna com dois caminhos principais:

- integracao direta com a API do TomTicket para sincronizacao, criacao, listagem e fechamento de chamados
- fallback via navegador com Playwright quando a criacao ou o fechamento nao puderem usar a API

## Estado Atual

- interface dividida em `Fila de Chamados`, `Gerenciar Abertos`, `Credenciais` e `Logs`
- criacao em lote com fila persistida localmente no renderer
- sincronizacao de departamentos, categorias, clientes e atendentes via API
- listagem de chamados abertos com filtro por atendente
- fechamento em lote com apoio de IA para gerar textos de solucao
- geracao de descricoes de abertura e solucoes de encerramento via Gemini
- `renderer` modularizado por responsabilidade
- `preload` exposto com API minima e explicita
- segredos sensiveis nao ficam persistidos no `localStorage` do renderer
- configuracoes sensiveis ficam no processo principal via `config-store.js`, usando `safeStorage` do Electron quando disponivel
- contratos operacionais retornam estados explicitos como `success`, `partial`, `retryable_error` e `fatal_error`

## Fluxo de Uso

1. preencher credenciais em `Credenciais`
2. informar ao menos o `token` da API ou as credenciais completas do navegador
3. usar `Sincronizar Dados` para carregar catalogos da API quando houver token
4. montar a fila de abertura em `Fila de Chamados` e opcionalmente gerar as mensagens com IA
5. usar `Gerenciar Abertos` para buscar chamados, gerar solucoes e fechar em lote

Observacoes importantes:

- `token` e obrigatorio para sincronizacao de catalogos e para listar chamados abertos
- sem `token`, a criacao e o fechamento ainda podem usar o fallback via navegador se `conta`, `email` e `senha` estiverem preenchidos
- a chave Gemini e recomendada para geracao de texto; sem ela, o backend devolve mensagens padrao simples

## Desenvolvimento

```bash
npm install
npm start
npm test
```

Os testes atuais cobrem helpers de dominio do renderer, contratos operacionais e partes criticas do fallback via navegador.

## Build

```bash
npm run dist:win
npm run dist:dir
```

O build do Windows usa `electron-builder` com alvo `nsis` e gera o instalador em `dist/`.

Artefatos esperados:

- `dist/Smart Service Desk Automator Setup 1.0.0.exe`
- `dist/win-unpacked/`

O empacotamento exclui testes automatizados, scripts manuais e artefatos de debug que nao fazem parte do app distribuido.

## Scripts Manuais

Scripts utilitarios de diagnostico ficam em `scripts/manual/`:

- `npm run manual:customers`
- `npm run manual:tickets:list`
- `npm run manual:tickets:create`

Esses scripts dependem de variaveis de ambiente como `TOMTICKET_TOKEN` e `TOMTICKET_TEST_DEPARTMENT_ID`, e escrevem saidas temporarias em `scripts/manual/output/`.

## Seguranca e Armazenamento

- `contextIsolation: true`
- `nodeIntegration: false`
- ponte `preload.js` restrita a chamadas whitelisted
- token TomTicket, senha e chave Gemini sao armazenados no processo principal, nao no `localStorage` do renderer
- a senha do navegador so e persistida quando `saveCredentials` estiver ativo
- cache operacional do renderer usa `localStorage` apenas para fila e catalogos nao sensiveis

## Observacoes

- o fallback via navegador continua dependente do layout externo do portal TomTicket
- os testes atuais sao unitarios; nao ha E2E real contra o portal externo
- a interface e focada em operacao Windows e o instalador atual e gerado apenas para esse alvo
