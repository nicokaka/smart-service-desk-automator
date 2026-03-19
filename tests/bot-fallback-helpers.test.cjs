const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BOT_ERROR_CODES,
  classifyBotError,
  cleanupSession,
  summarizeBatchResults,
} = require("../bot-fallback-helpers");
const { runBot } = require("../bot");

test("classifyBotError detects dependency and timeout failures", () => {
  const dependencyError = classifyBotError(
    new Error("Playwright Chromium indisponivel neste ambiente."),
  );
  assert.equal(dependencyError.code, BOT_ERROR_CODES.DEPENDENCY_MISSING);

  const timeoutCause = new Error("waiting failed");
  timeoutCause.name = "TimeoutError";
  const timeoutError = classifyBotError(timeoutCause, { action: "abrir portal" });
  assert.equal(timeoutError.code, BOT_ERROR_CODES.TIMEOUT);
  assert.match(timeoutError.message, /abrir portal/i);
});

test("classifyBotError distinguishes selector issues from probable layout changes", () => {
  const selectorError = classifyBotError(
    new Error("waiting for selector '#titulo' failed"),
    { action: "preencher assunto" },
  );
  assert.equal(selectorError.code, BOT_ERROR_CODES.SELECTOR_NOT_FOUND);

  const layoutError = classifyBotError(
    new Error("waiting for selector '#customersearch' failed"),
    { action: "abrir formulario", probableLayoutChange: true },
  );
  assert.equal(layoutError.code, BOT_ERROR_CODES.LAYOUT_CHANGED);
});

test("classifyBotError identifies login/session failures", () => {
  const loginError = classifyBotError(
    new Error("captcha required after login attempt"),
    { phase: "login" },
  );
  assert.equal(loginError.code, BOT_ERROR_CODES.LOGIN_REQUIRED);
});

test("cleanupSession attempts to close page, context and browser even after close errors", async () => {
  const calls = [];
  const logger = { warn: (message) => calls.push(message) };

  const session = {
    page: {
      close: async () => {
        calls.push("page");
      },
    },
    context: {
      close: async () => {
        calls.push("context");
        throw new Error("context close failed");
      },
    },
    browser: {
      close: async () => {
        calls.push("browser");
      },
    },
  };

  const results = await cleanupSession(session, logger);
  assert.deepEqual(
    calls.filter((entry) => ["page", "context", "browser"].includes(entry)),
    ["page", "context", "browser"],
  );
  assert.equal(results[0].closed, true);
  assert.equal(results[1].closed, false);
  assert.equal(results[2].closed, true);
});

test("runBot always cleans up injected session when ticket processing fails", async () => {
  const closed = [];
  const fakeSession = {
    page: {
      close: async () => {
        closed.push("page");
      },
    },
    context: {
      close: async () => {
        closed.push("context");
      },
    },
    browser: {
      close: async () => {
        closed.push("browser");
      },
    },
  };

  const result = await runBot(
    [{ id: "1", client: "ACME", dept: "TI", summary: "VPN" }],
    {},
    {
      logger: {
        log() {},
        warn() {},
        error() {},
      },
      session: fakeSession,
      createTicketInBrowser: async () => {
        throw new Error("waiting for selector '#titulo' failed");
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.details[0].status, "Error");
  assert.equal(result.details[0].code, BOT_ERROR_CODES.SELECTOR_NOT_FOUND);
  assert.deepEqual(closed, ["page", "context", "browser"]);
});

test("summarizeBatchResults reports partial browser batches clearly", () => {
  const message = summarizeBatchResults(
    [
      { status: "Success" },
      { status: "Error" },
    ],
    "close",
  );

  assert.match(message, /falhas parciais/i);
  assert.match(message, /1 ok, 1 erro/i);
});
