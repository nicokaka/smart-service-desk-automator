const BOT_ERROR_CODES = Object.freeze({
  DEPENDENCY_MISSING: "DEPENDENCY_MISSING",
  UNSUPPORTED_BROWSER: "UNSUPPORTED_BROWSER",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  SESSION_ERROR: "SESSION_ERROR",
  SELECTOR_NOT_FOUND: "SELECTOR_NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  LAYOUT_CHANGED: "LAYOUT_CHANGED",
  ACTION_FAILED: "ACTION_FAILED",
  UNKNOWN: "UNKNOWN",
});

function createBotError(code, message, meta = {}, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.meta = meta;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function classifyBotError(error, context = {}) {
  if (error?.code && Object.values(BOT_ERROR_CODES).includes(error.code)) {
    return error;
  }

  const message = String(error?.message || error || "Falha desconhecida.");
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("playwright") &&
    (lowerMessage.includes("indispon") || lowerMessage.includes("missing"))
  ) {
    return createBotError(
      BOT_ERROR_CODES.DEPENDENCY_MISSING,
      "Dependencia do navegador indisponivel. Instale o Playwright no ambiente de execucao.",
      context,
      error,
    );
  }

  if (lowerMessage.includes("unsupported browser")) {
    return createBotError(
      BOT_ERROR_CODES.UNSUPPORTED_BROWSER,
      "Navegador nao suportado pelo fallback.",
      context,
      error,
    );
  }

  if (
    error?.name === "TimeoutError" ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out")
  ) {
    return createBotError(
      BOT_ERROR_CODES.TIMEOUT,
      `Timeout ao aguardar ${context.action || context.phase || "etapa do fallback"}.`,
      context,
      error,
    );
  }

  if (
    lowerMessage.includes("login") ||
    lowerMessage.includes("sessao") ||
    lowerMessage.includes("session") ||
    lowerMessage.includes("captcha") ||
    lowerMessage.includes("2fa") ||
    lowerMessage.includes("autentic")
  ) {
    return createBotError(
      BOT_ERROR_CODES.LOGIN_REQUIRED,
      "Falha de login/sessao no portal. Verifique credenciais, captcha ou expiracao da sessao.",
      context,
      error,
    );
  }

  if (
    lowerMessage.includes("selector") ||
    lowerMessage.includes("strict mode violation") ||
    lowerMessage.includes("no node found for selector")
  ) {
    const code = context.probableLayoutChange
      ? BOT_ERROR_CODES.LAYOUT_CHANGED
      : BOT_ERROR_CODES.SELECTOR_NOT_FOUND;

    return createBotError(
      code,
      context.probableLayoutChange
        ? `Mudanca provavel de layout ao executar ${context.action || context.phase || "acao"}.`
        : `Seletor nao encontrado ao executar ${context.action || context.phase || "acao"}.`,
      context,
      error,
    );
  }

  return createBotError(
    BOT_ERROR_CODES.UNKNOWN,
    context.defaultMessage || message,
    context,
    error,
  );
}

async function closeResource(resource, label, logger = console) {
  if (!resource || typeof resource.close !== "function") {
    return { label, closed: false, skipped: true };
  }

  try {
    await resource.close();
    return { label, closed: true, skipped: false };
  } catch (error) {
    if (logger?.warn) {
      logger.warn(`[BOT][cleanup] Falha ao fechar ${label}: ${error.message}`);
    }

    return { label, closed: false, skipped: false, error };
  }
}

async function cleanupSession(session = {}, logger = console) {
  const results = [];
  results.push(await closeResource(session.page, "page", logger));
  results.push(await closeResource(session.context, "context", logger));
  results.push(await closeResource(session.browser, "browser", logger));
  return results;
}

function summarizeBatchResults(results = [], mode = "create") {
  const successCount = results.filter((item) => item.status === "Success").length;
  const errorCount = results.length - successCount;
  const action = mode === "close" ? "fechamento" : "criacao";

  if (results.length === 0) {
    return `Nenhum item processado no fallback de ${action}.`;
  }

  if (errorCount === 0) {
    return `Lote de ${action} via navegador concluido com sucesso (${successCount}/${results.length}).`;
  }

  return `Lote de ${action} via navegador concluido com falhas parciais (${successCount} ok, ${errorCount} erro).`;
}

module.exports = {
  BOT_ERROR_CODES,
  classifyBotError,
  cleanupSession,
  createBotError,
  summarizeBatchResults,
};
