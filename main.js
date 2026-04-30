const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

const { runBot } = require("./bot");
const {
  generateTicketMessage,
  generateSolutionMessage,
} = require("./ai_service");
const {
  createTicket,
  finalizeTicket,
  getCategories,
  getCustomers,
  getDepartments,
  getOperators,
  getTickets,
  linkAttendant,
} = require("./tomticket_api");
const configStore = require("./config-store");
const {
  RESULT_STATUS,
  combineStatuses,
  fatalErrorResult,
  getLogLevel,
  partialResult,
  retryableErrorResult,
  successResult,
} = require("./operation-result");
const {
  normalizeString,
  computeWaitTime,
  findCustomerIdentifier,
  findCategoryId,
  buildCreatePayload,
  extractCreatedTicketId,
} = require("./shared/domain");

app.disableHardwareAcceleration();

function normalizeBoolean(value) {
  return value === true || value === "true";
}

function createValidationError(message, details = []) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.details = details;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasBrowserCredentials(settings) {
  return Boolean(settings.account && settings.email && settings.password);
}

// findCategoryId, buildCreatePayload, extractCreatedTicketId
// are imported from ./shared/domain

function createBrowserTicketRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    client: row.clientName,
    dept: row.departmentName || "",
    category: row.categoryName || "",
    summary: row.subject,
    message: row.message,
    attendant: row.attendantName || "",
  }));
}

function normalizeBotBatchDetails(details = []) {
  return details.map((detail) => ({
    id: detail.id,
    status:
      detail.status === "Success"
        ? RESULT_STATUS.SUCCESS
        : detail.status === "Error"
          ? RESULT_STATUS.FATAL_ERROR
          : RESULT_STATUS.PARTIAL,
    message: detail.message || "Resultado retornado pelo fallback via navegador.",
    code: detail.code || null,
  }));
}

function mergeSettings(overrides = {}) {
  return configStore.mergeSettings({
    ...overrides,
    turboMode:
      overrides.turboMode !== undefined ? overrides.turboMode : overrides.turbo,
  });
}

function ensureToken(settings) {
  if (!settings.token) {
    throw createValidationError("Token da API nao configurado.");
  }
}

function validateExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
    throw createValidationError("URL externa invalida.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw createValidationError("URL externa invalida.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw createValidationError("Apenas URLs http/https sao permitidas.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw createValidationError("URLs com credenciais embutidas nao sao permitidas.");
  }

  return parsedUrl.toString();
}

function validateSettingsOverrides(overrides) {
  if (overrides === undefined) {
    return;
  }

  if (!isPlainObject(overrides)) {
    throw createValidationError("Payload de configuracao invalido.");
  }
}

function validateCreatePayload(rows, context) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createValidationError("Nenhuma linha enviada para criacao.");
  }

  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      throw createValidationError(`Linha ${index + 1} possui formato invalido.`);
    }

    if (!normalizeString(row.id)) {
      throw createValidationError(`Linha ${index + 1} sem identificador.`);
    }

    if (!normalizeString(row.clientName)) {
      throw createValidationError(`Linha ${index + 1} sem cliente.`);
    }

    if (!normalizeString(row.departmentId)) {
      throw createValidationError(`Linha ${index + 1} sem departamento.`);
    }

    if (!normalizeString(row.subject)) {
      throw createValidationError(`Linha ${index + 1} sem resumo.`);
    }
  });

  if (!isPlainObject(context)) {
    throw createValidationError("Contexto de criacao invalido.");
  }

  if (!isPlainObject(context.settings)) {
    throw createValidationError("Configuracoes da criacao invalidas.");
  }

  if (!isPlainObject(context.catalog)) {
    throw createValidationError("Catalogo de criacao invalido.");
  }

  if (!Array.isArray(context.catalog.fullCustomers)) {
    throw createValidationError("Catalogo de clientes invalido.");
  }

  if (!Array.isArray(context.catalog.fullCategories)) {
    throw createValidationError("Catalogo de categorias invalido.");
  }
}

function validateClosePayload(tickets, overrides) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw createValidationError("Nenhum chamado enviado para fechamento.");
  }

  tickets.forEach((ticket, index) => {
    if (!isPlainObject(ticket)) {
      throw createValidationError(
        `Chamado ${index + 1} possui payload invalido.`,
      );
    }

    if (!normalizeString(ticket.id)) {
      throw createValidationError(`Chamado ${index + 1} sem ID.`);
    }

    if (typeof ticket.solution !== "string") {
      throw createValidationError(`Chamado ${index + 1} com solucao invalida.`);
    }
  });

  validateSettingsOverrides(overrides);
}

function validateAiPayload(payload, type) {
  if (!isPlainObject(payload)) {
    throw createValidationError(`Payload de IA invalido para ${type}.`);
  }

  if (type === "ticket" && !normalizeString(payload.summary)) {
    throw createValidationError("Resumo ausente para geracao com IA.");
  }

  if (type === "solution" && !normalizeString(payload.title)) {
    throw createValidationError("Titulo ausente para geracao de solucao.");
  }

  if (!normalizeString(payload.clientName)) {
    throw createValidationError("Cliente ausente para operacao de IA.");
  }

  if (!isPlainObject(payload.settings)) {
    throw createValidationError("Configuracoes de IA invalidas.");
  }
}

function validateResultDataArray(result) {
  return (
    result?.status === RESULT_STATUS.SUCCESS &&
    Array.isArray(result.data) &&
    result.data.length > 0
  );
}

function logOperation(operation, result, extra = {}) {
  const level = getLogLevel(result.status);
  const logger =
    level === "warn" ? console.warn : level === "error" ? console.error : console.log;

  logger(`[MAIN][${operation}][${result.status}] ${result.message}`, extra);
}

function buildBatchResult(operation, details, successMessage, partialMessage) {
  const statuses = details.map((detail) => ({ status: detail.status }));
  const combined = combineStatuses(statuses);
  const successCount = details.filter(
    (detail) => detail.status === RESULT_STATUS.SUCCESS,
  ).length;
  const partialCount = details.filter(
    (detail) => detail.status === RESULT_STATUS.PARTIAL,
  ).length;

  if (combined === RESULT_STATUS.SUCCESS) {
    return successResult(operation, { details }, successMessage, {
      total: details.length,
    });
  }

  if (successCount > 0 || partialCount > 0) {
    return partialResult(
      operation,
      partialMessage,
      { details },
      details
        .filter((detail) => detail.status !== RESULT_STATUS.SUCCESS)
        .map((detail) => ({
          message: detail.message,
          details: detail.errors || detail.warnings || [],
        })),
      [],
      { total: details.length, successCount, partialCount },
    );
  }

  const retryable = details.some(
    (detail) => detail.status === RESULT_STATUS.RETRYABLE_ERROR,
  );

  return retryable
    ? retryableErrorResult(
        operation,
        new Error(partialMessage),
        { details, total: details.length },
      )
    : fatalErrorResult(
        operation,
        new Error(partialMessage),
        { details, total: details.length },
      );
}

function buildCategorySectionResult(categoryResults) {
  const successfulCategories = categoryResults
    .filter((result) => result.status === RESULT_STATUS.SUCCESS)
    .flatMap((result) => result.data);

  if (
    categoryResults.length > 0 &&
    categoryResults.every((result) => result.status === RESULT_STATUS.SUCCESS)
  ) {
    return successResult(
      "catalog:categories",
      successfulCategories,
      "Categorias sincronizadas com sucesso.",
      { departments: categoryResults.length },
    );
  }

  if (successfulCategories.length > 0) {
    return partialResult(
      "catalog:categories",
      "Categorias sincronizadas parcialmente.",
      successfulCategories,
      categoryResults
        .filter((result) => result.status !== RESULT_STATUS.SUCCESS)
        .flatMap((result) => result.errors || []),
      [],
      { departments: categoryResults.length },
    );
  }

  const hasRetryable = categoryResults.some(
    (result) => result.status === RESULT_STATUS.RETRYABLE_ERROR,
  );

  return hasRetryable
    ? retryableErrorResult(
        "catalog:categories",
        new Error("Falha temporaria ao sincronizar categorias."),
        { categoryResults },
      )
    : fatalErrorResult(
        "catalog:categories",
        new Error("Falha fatal ao sincronizar categorias."),
        { categoryResults },
      );
}

function attachDepartmentMetadata(categories, department) {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories.map((category) => ({
    ...category,
    department_id:
      category?.department_id ??
      category?.departmentId ??
      department.id,
    department_name:
      category?.department_name ??
      category?.departmentName ??
      department.name,
  }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.loadFile("index.html");

  win.webContents.on("before-input-event", (event, input) => {
    if (input.control && !input.alt) {
      if (input.key === "=" || input.key === "+") {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
        event.preventDefault();
      } else if (input.key === "-") {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
        event.preventDefault();
      } else if (input.key === "0") {
        win.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("settings:load", async () => {
  const result = successResult(
    "settings:load",
    configStore.getSettings(),
    "Configuracoes carregadas.",
  );
  logOperation("settings:load", result);
  return result;
});

ipcMain.handle("settings:save", async (event, settings) => {
  try {
    validateSettingsOverrides(settings);
    const result = successResult(
      "settings:save",
      configStore.saveSettings(settings),
      "Configuracoes salvas.",
    );
    logOperation("settings:save", result);
    return result;
  } catch (error) {
    const result = fatalErrorResult("settings:save", error, { validation: true });
    logOperation("settings:save", result);
    return result;
  }
});

ipcMain.handle("catalog:sync", async (event, overrides = {}) => {
  try {
    validateSettingsOverrides(overrides);

    const settings = mergeSettings(overrides);
    ensureToken(settings);

    // Step 1: Departments first (everything else depends on them)
    const departmentsResult = await getDepartments(settings.token);
    logOperation("catalog:departments", departmentsResult);

    if (!validateResultDataArray(departmentsResult)) {
      return departmentsResult.status === RESULT_STATUS.SUCCESS
        ? fatalErrorResult(
            "catalog:sync",
            new Error("Nenhum departamento retornado pela API."),
          )
        : departmentsResult;
    }

    // Step 2: Fetch operators and customers sequentially
    const operatorsResult = await getOperators(settings.token);
    logOperation("catalog:operators", operatorsResult);

    const customersResult = await getCustomers(settings.token);
    logOperation("catalog:customers", customersResult);

    // Step 3: Fetch department categories sequentially to avoid API Rate Limits
    const categoryResults = [];
    for (const department of departmentsResult.data) {
      const result = await getCategories(settings.token, department.id);
      const normalized = result.status === RESULT_STATUS.SUCCESS
          ? { ...result, data: attachDepartmentMetadata(result.data, department) }
          : result;
      logOperation(normalized.operation, normalized);
      categoryResults.push(normalized);
    }



    const categoriesResult = buildCategorySectionResult(categoryResults);
    logOperation("catalog:categories", categoriesResult);

    const sections = {
      departments: departmentsResult,
      operators: operatorsResult,
      categories: categoriesResult,
      customers: customersResult,
    };

    const sectionStatuses = Object.values(sections).map((section) => ({
      status: section.status,
    }));
    const overallStatus = combineStatuses(sectionStatuses);

    if (
      overallStatus === RESULT_STATUS.SUCCESS &&
      customersResult.status === RESULT_STATUS.SUCCESS &&
      categoriesResult.status === RESULT_STATUS.SUCCESS
    ) {
      return successResult(
        "catalog:sync",
        { sections },
        "Catalogo sincronizado com sucesso.",
      );
    }

    return partialResult(
      "catalog:sync",
      "Catalogo sincronizado parcialmente. Verifique as secoes com falha.",
      { sections },
      Object.values(sections).flatMap((section) => section.errors || []),
      [],
    );
  } catch (error) {
    const result = fatalErrorResult("catalog:sync", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("catalog:sync", result);
    return result;
  }
});

ipcMain.handle("tickets:list", async (event, overrides = {}) => {
  try {
    validateSettingsOverrides(overrides);
    const settings = mergeSettings(overrides);
    ensureToken(settings);
    const result = await getTickets(settings.token);
    logOperation("tickets:list", result);
    return result;
  } catch (error) {
    const result = fatalErrorResult("tickets:list", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("tickets:list", result);
    return result;
  }
});

ipcMain.handle("tickets:create", async (event, rows = [], context = {}) => {
  try {
    validateCreatePayload(rows, context);

    const settings = mergeSettings(context.settings || {});
    const waitTime = computeWaitTime(settings);

    if (!settings.token) {
      if (!hasBrowserCredentials(settings)) {
        throw createValidationError(
          "Token ausente e credenciais do navegador incompletas para fallback.",
        );
      }

      const botResult = await runBot(createBrowserTicketRows(rows), settings);
      const normalizedDetails = normalizeBotBatchDetails(botResult.details || []);
      return botResult.success
        ? { ...buildBatchResult(
            "tickets:create",
            normalizedDetails,
            botResult.message || "Criacao concluida via navegador.",
            botResult.message || "Criacao via navegador concluiu com falhas parciais.",
          ), details: normalizedDetails }
        : fatalErrorResult(
            "tickets:create",
            new Error(botResult.message || "Falha no fallback via navegador."),
            { botCode: botResult.code || null },
          );
    }

    const fullCustomers = context.catalog.fullCustomers;
    const fullCategories = context.catalog.fullCategories;

    if (fullCustomers.length === 0) {
      throw createValidationError(
        "Catalogo de clientes indisponivel. Sincronize novamente.",
      );
    }

    const details = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      event.sender.send("tickets:progress", {
        current: index + 1,
        total: rows.length,
        action: "create",
      });

      try {
        const customerIdentifier = findCustomerIdentifier(
          fullCustomers,
          row.clientName,
        );

        if (!customerIdentifier) {
          throw new Error(`Cliente "${row.clientName}" nao encontrado.`);
        }

        const categoryId = findCategoryId(
          fullCategories,
          row.departmentId,
          row.categoryName,
        );

        if (row.categoryName && !categoryId) {
          throw new Error(
            `Categoria "${row.categoryName}" nao encontrada para o departamento selecionado.`,
          );
        }

        const createResult = await createTicket(
          settings.token,
          buildCreatePayload(row, customerIdentifier, categoryId),
        );
        logOperation(`tickets:create:${row.id}`, createResult);

        if (createResult.status !== RESULT_STATUS.SUCCESS) {
          details.push({
            id: row.id,
            status: createResult.status,
            message: createResult.message,
            errors: createResult.errors,
          });
          continue;
        }

        const createdTicketId = extractCreatedTicketId(createResult.data);
        if (!createdTicketId) {
          details.push({
            id: row.id,
            status: RESULT_STATUS.FATAL_ERROR,
            message: "Chamado criado sem ticket_id identificavel.",
          });
          continue;
        }

        if (row.attendantId) {
          const linkResult = await linkAttendant(
            settings.token,
            createdTicketId,
            row.attendantId,
          );
          logOperation(`tickets:link-operator:${row.id}`, linkResult);

          if (linkResult.status !== RESULT_STATUS.SUCCESS) {
            details.push({
              id: row.id,
              status: RESULT_STATUS.PARTIAL,
              message:
                "Chamado criado, mas o vinculo de atendente nao foi concluido.",
              warnings: [linkResult.message],
            });
            continue;
          }
        }

        details.push({
          id: row.id,
          status: RESULT_STATUS.SUCCESS,
          message: "Chamado criado.",
        });
      } catch (error) {
        details.push({
          id: row.id,
          status: RESULT_STATUS.FATAL_ERROR,
          message: error.message,
        });
      }

      if (index < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    const result = buildBatchResult(
      "tickets:create",
      details,
      "Lote de criacao concluido com sucesso.",
      "Lote de criacao concluido com falhas parciais.",
    );
    logOperation("tickets:create", result);
    return { ...result, details };
  } catch (error) {
    const result = fatalErrorResult("tickets:create", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("tickets:create", result);
    return result;
  }
});

ipcMain.handle("tickets:close", async (event, tickets = [], overrides = {}) => {
  try {
    validateClosePayload(tickets, overrides);
    const settings = mergeSettings(overrides);
    const waitTime = computeWaitTime(settings);

    if (!settings.token) {
      if (!hasBrowserCredentials(settings)) {
        throw createValidationError(
          "Token ausente e credenciais do navegador incompletas para fallback.",
        );
      }

      const botResult = await runBot(tickets, { ...settings, mode: "close" });
      const normalizedDetails = normalizeBotBatchDetails(botResult.details || []);
      return botResult.success
        ? { ...buildBatchResult(
            "tickets:close",
            normalizedDetails,
            botResult.message || "Fechamento concluido via navegador.",
            botResult.message || "Fechamento via navegador concluiu com falhas parciais.",
          ), details: normalizedDetails }
        : fatalErrorResult(
            "tickets:close",
            new Error(botResult.message || "Falha no fechamento via navegador."),
            { botCode: botResult.code || null },
          );
    }

    const details = [];

    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      event.sender.send("tickets:progress", {
        current: index + 1,
        total: tickets.length,
        action: "close",
      });
      const closeResult = await finalizeTicket(
        settings.token,
        ticket.id,
        ticket.solution,
      );
      logOperation(`tickets:close:${ticket.id}`, closeResult);

      details.push({
        id: ticket.id,
        status: closeResult.status,
        message:
          closeResult.status === RESULT_STATUS.SUCCESS
            ? "Chamado finalizado via API."
            : closeResult.message,
        errors: closeResult.errors,
      });

      if (index < tickets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    const result = buildBatchResult(
      "tickets:close",
      details,
      "Lote de fechamento concluido com sucesso.",
      "Lote de fechamento concluido com falhas parciais.",
    );
    logOperation("tickets:close", result);
    return { ...result, details };
  } catch (error) {
    const result = fatalErrorResult("tickets:close", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("tickets:close", result);
    return result;
  }
});

ipcMain.handle("ai:generate-ticket", async (event, payload = {}) => {
  try {
    validateAiPayload(payload, "ticket");
    const settings = mergeSettings(payload.settings || {});
    const data = await generateTicketMessage(
      payload.summary,
      payload.clientName,
      settings.apiKey,
      settings.customPrompt,
      settings.model,
    );
    const result = successResult(
      "ai:generate-ticket",
      data,
      "Texto gerado com IA.",
    );
    logOperation("ai:generate-ticket", result);
    return result;
  } catch (error) {
    const result = fatalErrorResult("ai:generate-ticket", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("ai:generate-ticket", result);
    return result;
  }
});

ipcMain.handle("ai:generate-solution", async (event, payload = {}) => {
  try {
    validateAiPayload(payload, "solution");
    const settings = mergeSettings(payload.settings || {});
    const data = await generateSolutionMessage(
      payload.title,
      payload.description,
      payload.clientName,
      settings.apiKey,
      settings.customPrompt,
      settings.model,
    );
    const result = successResult(
      "ai:generate-solution",
      data,
      "Solucao gerada com IA.",
    );
    logOperation("ai:generate-solution", result);
    return result;
  } catch (error) {
    const result = fatalErrorResult("ai:generate-solution", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("ai:generate-solution", result);
    return result;
  }
});

ipcMain.handle("shell:open-external", async (event, rawUrl) => {
  try {
    const safeUrl = validateExternalUrl(rawUrl);
    await shell.openExternal(safeUrl);
    const result = successResult(
      "shell:open-external",
      { url: safeUrl },
      "URL externa aberta.",
    );
    logOperation("shell:open-external", result);
    return result;
  } catch (error) {
    const result = fatalErrorResult("shell:open-external", error, {
      validation: error.code === "VALIDATION_ERROR",
    });
    logOperation("shell:open-external", result);
    return result;
  }
});
