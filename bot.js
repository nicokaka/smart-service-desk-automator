const {
  BOT_ERROR_CODES,
  classifyBotError,
  cleanupSession,
  createBotError,
  summarizeBatchResults,
} = require("./bot-fallback-helpers");

let chromium;
let firefox;

try {
  const playwright = require("@playwright/test");
  chromium = playwright.chromium;
  firefox = playwright.firefox;
} catch (error) {
  console.warn(
    "Playwright dependencies are missing or could not be loaded. Browser fallback will fail if attempted.",
  );
}

const HEADLESS = false;
const URL = "https://console.tomticket.com";
const DEFAULT_TIMEOUT_MS = 15000;
const SHORT_TIMEOUT_MS = 5000;

const SELECTORS = Object.freeze({
  authenticated: [
    'a[href*="/panel/chamados"]',
    "#customersearch",
    "#titulo",
  ],
  login: {
    account: ["#conta"],
    email: ["#email"],
    password: ["#senha"],
    submit: [
      'button[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Entrar")',
    ],
  },
  create: {
    entry: [
      'a[href*="/panel/chamados/novo"]',
      'button:has-text("Novo Chamado")',
      'a:has-text("Novo Chamado")',
      'text="Novo Chamado"',
    ],
    customerInput: ["#customersearch"],
    autocompleteOption: [
      '[role="option"]',
      ".ui-menu-item",
      ".select2-results__option",
      "li.ui-menu-item",
    ],
    departmentInput: ["#coddepartamento"],
    subjectInput: ["#titulo"],
    richMessageFrame: ["iframe.fr-iframe"],
    richMessageInput: [".fr-view", 'div[contenteditable="true"]'],
    plainMessageInput: ['textarea[name="mensagem"]', "textarea"],
    priorityInput: ["#prioridade"],
    attendantInput: ["#codatendente"],
    submit: [
      'button:has-text("Criar Chamado")',
      'input[type="submit"][value*="Criar"]',
      'button[type="submit"]',
    ],
    success: [
      ".alert-success",
      ".swal2-success",
      ".toast-success",
      'text="Chamado criado"',
    ],
  },
  close: {
    finish: [
      'a.btn-success:has-text("Finalizar")',
      'button:has-text("Finalizar")',
      'a:has-text("Finalizar")',
      'a.btn:has-text("Encerrar")',
      'button:has-text("Encerrar")',
      'a:has-text("Encerrar")',
      'a.btn-success:has-text("Resolver")',
      'button:has-text("Resolver")',
      'a[href*="/panel/chamados/finalizar/"]',
    ],
    solutionInput: ["textarea:visible", "textarea"],
    confirm: [
      "button.btn-success:visible",
      'button:has-text("Confirmar")',
      'button:has-text("Encerrar")',
      'button:has-text("Salvar")',
    ],
    success: [
      ".alert-success",
      ".swal2-success",
      ".toast-success",
      'text="Chamado finalizado"',
      'text="Chamado encerrado"',
    ],
  },
});

function getLogger(runtime = {}) {
  return runtime.logger || console;
}

function getBrowserEngines(runtime = {}) {
  return runtime.playwright || { chromium, firefox };
}

async function waitForAnyVisible(page, selectors, timeout = SHORT_TIMEOUT_MS) {
  const attempts = selectors.map(async (selector) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout });
    return { locator, selector };
  });

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

async function requireVisible(page, selectors, context, timeout = SHORT_TIMEOUT_MS) {
  const match = await waitForAnyVisible(page, selectors, timeout);
  if (!match) {
    throw createBotError(
      BOT_ERROR_CODES.LAYOUT_CHANGED,
      `Mudanca provavel de layout ao aguardar ${context.action || context.phase || "elemento"}.`,
      { ...context, probableLayoutChange: true, selectors },
    );
  }
  return match;
}

async function fillFirstAvailable(page, selectors, value, context) {
  const match = await requireVisible(page, selectors, context);
  try {
    await match.locator.fill(value);
    return match.selector;
  } catch (error) {
    throw classifyBotError(error, {
      ...context,
      selector: match.selector,
      probableLayoutChange: true,
    });
  }
}

async function clickFirstAvailable(page, selectors, context) {
  const match = await requireVisible(page, selectors, context);
  try {
    await match.locator.click();
    return match.selector;
  } catch (error) {
    throw classifyBotError(error, {
      ...context,
      selector: match.selector,
      probableLayoutChange: true,
    });
  }
}

async function gotoPage(page, targetUrl, context) {
  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.waitForLoadState("domcontentloaded");
  } catch (error) {
    throw classifyBotError(error, {
      ...context,
      action: context.action || `navegar para ${targetUrl}`,
      defaultMessage: `Falha ao navegar para ${targetUrl}.`,
    });
  }
}

async function waitForAuthenticated(page) {
  try {
    await Promise.any([
      page.waitForURL(/\/panel\//, { timeout: DEFAULT_TIMEOUT_MS }),
      waitForAnyVisible(page, SELECTORS.authenticated, DEFAULT_TIMEOUT_MS).then(
        (match) => {
          if (!match) {
            throw new Error("No authenticated marker was found.");
          }
        },
      ),
    ]);
  } catch (error) {
    throw classifyBotError(error, {
      phase: "login",
      action: "confirmar sessao autenticada",
    });
  }
}

async function ensureAuthenticatedSession(page, credentials, logger) {
  await gotoPage(page, URL, { phase: "bootstrap", action: "abrir portal" });

  if (/\/panel\//.test(page.url())) {
    return;
  }

  const loginVisible = await waitForAnyVisible(
    page,
    SELECTORS.login.email,
    SHORT_TIMEOUT_MS,
  );
  if (!loginVisible) {
    throw createBotError(
      BOT_ERROR_CODES.LAYOUT_CHANGED,
      "Portal carregou sem marcador de sessao autenticada nem formulario de login. Mudanca provavel de layout.",
      { phase: "login", probableLayoutChange: true },
    );
  }

  if (!credentials.email || !credentials.password) {
    throw createBotError(
      BOT_ERROR_CODES.LOGIN_REQUIRED,
      "Sessao nao autenticada e credenciais do navegador estao incompletas.",
      { phase: "login" },
    );
  }

  if (credentials.account) {
    await fillFirstAvailable(page, SELECTORS.login.account, credentials.account, {
      phase: "login",
      action: "preencher conta",
    });
  }

  await fillFirstAvailable(page, SELECTORS.login.email, credentials.email, {
    phase: "login",
    action: "preencher email",
  });
  await fillFirstAvailable(page, SELECTORS.login.password, credentials.password, {
    phase: "login",
    action: "preencher senha",
  });

  logger.log("[BOT] Tentando login automatico...");
  await clickFirstAvailable(page, SELECTORS.login.submit, {
    phase: "login",
    action: "enviar login",
  });

  try {
    await waitForAuthenticated(page);
  } catch (error) {
    throw createBotError(
      BOT_ERROR_CODES.LOGIN_REQUIRED,
      "Falha de login/sessao no portal. Verifique credenciais, captcha ou bloqueios de autenticacao.",
      { phase: "login" },
      error,
    );
  }
}

async function launchBrowserSession(credentials, runtime = {}) {
  if (runtime.session) {
    return runtime.session;
  }

  const browserType = credentials.browser || "chromium";
  const engines = getBrowserEngines(runtime);
  const logger = getLogger(runtime);
  const launchOptions = { headless: HEADLESS };

  let browser;
  if (browserType === "chromium") {
    if (!engines.chromium) {
      throw createBotError(
        BOT_ERROR_CODES.DEPENDENCY_MISSING,
        "Playwright Chromium indisponivel neste ambiente.",
        { phase: "bootstrap" },
      );
    }
    browser = await engines.chromium.launch(launchOptions);
  } else if (browserType === "firefox") {
    if (!engines.firefox) {
      throw createBotError(
        BOT_ERROR_CODES.DEPENDENCY_MISSING,
        "Playwright Firefox indisponivel neste ambiente.",
        { phase: "bootstrap" },
      );
    }
    browser = await engines.firefox.launch(launchOptions);
  } else {
    throw createBotError(
      BOT_ERROR_CODES.UNSUPPORTED_BROWSER,
      `Unsupported browser: ${browserType}`,
      { phase: "bootstrap" },
    );
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  logger.log(`[BOT] Navegador ${browserType} iniciado.`);
  await ensureAuthenticatedSession(page, credentials, logger);

  return { browser, context, page };
}

async function waitForAutocompleteSelection(page, typedValue) {
  const option = await waitForAnyVisible(
    page,
    SELECTORS.create.autocompleteOption,
    SHORT_TIMEOUT_MS,
  );

  if (option) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    return;
  }

  await page.keyboard.press("Enter");
  if (typedValue) {
    const activeValue = await page.evaluate(() => {
      const active = document.activeElement;
      return active && "value" in active ? active.value : "";
    });

    if (!String(activeValue || "").trim()) {
      throw createBotError(
        BOT_ERROR_CODES.SELECTOR_NOT_FOUND,
        "Nenhuma sugestao de autocomplete foi encontrada para o valor informado.",
        { phase: "create" },
      );
    }
  }
}

async function openNewTicketForm(page) {
  const formReady = await waitForAnyVisible(
    page,
    SELECTORS.create.customerInput,
    SHORT_TIMEOUT_MS,
  );
  if (formReady) {
    return;
  }

  try {
    await gotoPage(page, `${URL}/panel/chamados/novo`, {
      phase: "create",
      action: "abrir formulario de novo chamado",
    });
    await requireVisible(page, SELECTORS.create.customerInput, {
      phase: "create",
      action: "aguardar formulario de novo chamado",
    });
    return;
  } catch (directError) {
    await clickFirstAvailable(page, SELECTORS.create.entry, {
      phase: "create",
      action: "abrir novo chamado via menu",
    });
    await requireVisible(page, SELECTORS.create.customerInput, {
      phase: "create",
      action: "aguardar formulario de novo chamado",
    });

    if (directError) {
      return;
    }
  }
}

async function selectLookupValue(page, inputSelectors, value, context) {
  if (!value) {
    return;
  }

  await clickFirstAvailable(page, inputSelectors, context);
  await fillFirstAvailable(page, inputSelectors, value, context);
  await waitForAutocompleteSelection(page, value);
}

async function fillMessage(page, message) {
  const richFrame = await waitForAnyVisible(
    page,
    SELECTORS.create.richMessageFrame,
    2500,
  );

  if (richFrame) {
    const frame = page.frameLocator(richFrame.selector);
    for (const selector of SELECTORS.create.richMessageInput) {
      try {
        const locator = frame.locator(selector).first();
        await locator.waitFor({ state: "visible", timeout: SHORT_TIMEOUT_MS });
        await locator.fill(message);
        return;
      } catch {
        // Continue to next strategy.
      }
    }
  }

  await fillFirstAvailable(
    page,
    SELECTORS.create.plainMessageInput,
    message,
    {
      phase: "create",
      action: "preencher mensagem do chamado",
      probableLayoutChange: true,
    },
  );
}

async function waitForCreateOutcome(page) {
  try {
    await Promise.any([
      page.waitForURL((url) => !url.pathname.includes("/panel/chamados/novo"), {
        timeout: DEFAULT_TIMEOUT_MS,
      }),
      waitForAnyVisible(page, SELECTORS.create.success, DEFAULT_TIMEOUT_MS).then(
        (match) => {
          if (!match) {
            throw new Error("No create success marker was found.");
          }
        },
      ),
      page
        .locator(SELECTORS.create.subjectInput[0])
        .first()
        .waitFor({ state: "detached", timeout: DEFAULT_TIMEOUT_MS }),
    ]);
  } catch (error) {
    throw classifyBotError(error, {
      phase: "create",
      action: "confirmar criacao do chamado",
      probableLayoutChange: true,
      defaultMessage:
        "Nao foi possivel confirmar a criacao do chamado no portal.",
    });
  }
}

async function waitForCloseOutcome(page) {
  try {
    await Promise.any([
      waitForAnyVisible(page, SELECTORS.close.success, DEFAULT_TIMEOUT_MS).then(
        (match) => {
          if (!match) {
            throw new Error("No close success marker was found.");
          }
        },
      ),
      page
        .locator(SELECTORS.close.solutionInput[0])
        .first()
        .waitFor({ state: "hidden", timeout: DEFAULT_TIMEOUT_MS }),
      page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }),
    ]);
  } catch (error) {
    throw classifyBotError(error, {
      phase: "close",
      action: "confirmar fechamento do chamado",
      probableLayoutChange: true,
      defaultMessage:
        "Nao foi possivel confirmar o fechamento do chamado no portal.",
    });
  }
}

async function createTicketInBrowser(page, ticket, logger) {
  await openNewTicketForm(page);

  logger.log(`[BOT] Selecionando cliente: ${ticket.client}`);
  await selectLookupValue(page, SELECTORS.create.customerInput, ticket.client, {
    phase: "create",
    action: "selecionar cliente",
  });

  logger.log(`[BOT] Selecionando departamento: ${ticket.dept}`);
  await selectLookupValue(page, SELECTORS.create.departmentInput, ticket.dept, {
    phase: "create",
    action: "selecionar departamento",
  });

  if (ticket.category) {
    logger.log(`[BOT] Tentando selecionar categoria: ${ticket.category}`);
    try {
      await page.keyboard.press("Tab");
      await waitForAutocompleteSelection(page, "");
    } catch {
      // The department selection may already have committed without tabbing.
    }

    try {
      await page.keyboard.type(ticket.category);
      await waitForAutocompleteSelection(page, ticket.category);
    } catch (error) {
      logger.warn(`[BOT] Categoria nao confirmada: ${error.message}`);
    }
  }

  await fillFirstAvailable(
    page,
    SELECTORS.create.subjectInput,
    String(ticket.summary || "").substring(0, 50),
    {
      phase: "create",
      action: "preencher assunto",
    },
  );

  await fillMessage(page, ticket.message || ticket.summary || "");

  try {
    await page.selectOption(SELECTORS.create.priorityInput[0], "2");
  } catch (error) {
    logger.warn(`[BOT] Prioridade nao ajustada: ${error.message}`);
  }

  if (ticket.attendant) {
    try {
      await selectLookupValue(
        page,
        SELECTORS.create.attendantInput,
        ticket.attendant,
        {
          phase: "create",
          action: "selecionar atendente",
        },
      );
    } catch (error) {
      logger.warn(`[BOT] Atendente nao vinculado na criacao: ${error.message}`);
    }
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await clickFirstAvailable(page, SELECTORS.create.submit, {
    phase: "create",
    action: "enviar formulario de criacao",
  });
  await waitForCreateOutcome(page);
}

async function closeTicketInBrowser(page, ticket) {
  await gotoPage(page, `${URL}/panel/chamados/detalhes/${ticket.id}`, {
    phase: "close",
    action: `abrir chamado ${ticket.id}`,
  });

  await clickFirstAvailable(page, SELECTORS.close.finish, {
    phase: "close",
    action: `abrir fluxo de finalizacao do chamado ${ticket.id}`,
    probableLayoutChange: true,
  });
  await fillFirstAvailable(
    page,
    SELECTORS.close.solutionInput,
    ticket.solution || "",
    {
      phase: "close",
      action: `preencher solucao do chamado ${ticket.id}`,
    },
  );
  await clickFirstAvailable(page, SELECTORS.close.confirm, {
    phase: "close",
    action: `confirmar fechamento do chamado ${ticket.id}`,
    probableLayoutChange: true,
  });
  await waitForCloseOutcome(page);
}

function normalizeTicketError(error, ticket, mode) {
  const normalized = classifyBotError(error, {
    phase: mode,
    action:
      mode === "close"
        ? `processar fechamento do chamado ${ticket.id}`
        : `processar criacao para ${ticket.client}`,
  });

  return {
    id: ticket.id,
    status: "Error",
    code: normalized.code,
    message: normalized.message,
  };
}

async function processTickets(page, tickets, credentials, runtime = {}) {
  const logger = getLogger(runtime);
  const mode = credentials.mode === "close" ? "close" : "create";
  const actionHandler =
    mode === "close"
      ? runtime.closeTicketInBrowser || closeTicketInBrowser
      : runtime.createTicketInBrowser || createTicketInBrowser;
  const successMessage =
    mode === "close" ? "Chamado finalizado." : "Chamado criado.";

  const results = [];
  for (const ticket of tickets) {
    try {
      await actionHandler(page, ticket, logger);
      results.push({
        id: ticket.id,
        status: "Success",
        message: successMessage,
      });
    } catch (error) {
      const detail = normalizeTicketError(error, ticket, mode);
      logger.error(
        `[BOT][${mode}] Falha no item ${ticket.id || ticket.client}: ${detail.message}`,
      );
      results.push(detail);
    }
  }

  return results;
}

async function runBot(tickets, credentials = {}, runtime = {}) {
  const logger = getLogger(runtime);
  let session = {};

  try {
    session = await launchBrowserSession(credentials, runtime);
    const results = await processTickets(
      session.page,
      tickets,
      credentials,
      runtime,
    );

    return {
      success: true,
      message: summarizeBatchResults(results, credentials.mode),
      details: results,
    };
  } catch (error) {
    const normalized = classifyBotError(error, {
      phase: "bootstrap",
      action: "inicializar fallback via navegador",
    });
    logger.error(`[BOT][fatal] ${normalized.message}`);

    return {
      success: false,
      message: normalized.message,
      code: normalized.code,
      details: [],
    };
  } finally {
    await cleanupSession(session, logger);
  }
}

module.exports = {
  runBot,
};
