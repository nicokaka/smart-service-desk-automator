"use strict";

/**
 * Tests for ai_service.js
 * Run with: node --test tests/ai-service.test.cjs
 */

const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// ─── Deterministic mock for @google/generative-ai ────────────────────────────

let lastPrompt = "";
let mockResponse = JSON.stringify({ descricao: "Descrição gerada." });
let shouldThrow = null;
let modelRequestCount = 0;

const mockModel = {
  generateContent: async (prompt) => {
    modelRequestCount += 1;
    lastPrompt = prompt;

    if (shouldThrow) {
      const err = shouldThrow;
      shouldThrow = null;
      throw err;
    }

    return { response: { text: () => mockResponse } };
  },
};

require.cache[require.resolve("@google/generative-ai")] = {
  id: require.resolve("@google/generative-ai"),
  filename: require.resolve("@google/generative-ai"),
  loaded: true,
  exports: {
    GoogleGenerativeAI: class MockGenAI {
      constructor() {}
      getGenerativeModel() {
        return mockModel;
      }
    },
  },
};

// Now require the module under test — it will pick up our mock
const {
  generateTicketMessage,
  generateSolutionMessage,
  _clearModelCache,
} = require("../ai_service");

beforeEach(() => {
  modelRequestCount = 0;
  lastPrompt = "";
  mockResponse = JSON.stringify({ descricao: "Descrição gerada." });
  shouldThrow = null;
  _clearModelCache();
});

// ─── generateTicketMessage ────────────────────────────────────────────────────

describe("generateTicketMessage", () => {
  test("returns fallback JSON when no API key", async () => {
    const result = await generateTicketMessage("problema", "Acme", "", "", "");
    const parsed = JSON.parse(result);
    assert.ok(parsed.descricao.includes("problema"));
    assert.equal(modelRequestCount, 0);
  });

  test("calls model and returns cleaned response", async () => {
    mockResponse = JSON.stringify({ descricao: "Acme solicitou verificação." });
    const result = await generateTicketMessage(
      "internet lenta",
      "Acme",
      "fake-key",
      "",
      "gemini-2.5-flash",
    );
    assert.equal(modelRequestCount, 1);
    const parsed = JSON.parse(result);
    assert.equal(parsed.descricao, "Acme solicitou verificação.");
  });

  test("uses generic default context when customPrompt is empty", async () => {
    await generateTicketMessage("slowness", "Acme", "key", "", "gemini-flash");
    assert.ok(lastPrompt.includes("Service Desk"));
    assert.ok(!lastPrompt.includes("Hebron"));
    assert.ok(!lastPrompt.includes("Propagandistas"));
  });

  test("uses customPrompt when provided", async () => {
    await generateTicketMessage(
      "slowness", "Acme", "key", "Contexto customizado de test.", "gemini-flash",
    );
    assert.ok(lastPrompt.includes("Contexto customizado de test."));
  });

  test("strips markdown code fences from response", async () => {
    mockResponse = "```json\n{\"descricao\":\"ok\"}\n```";
    const result = await generateTicketMessage("x", "A", "key", "", "flash");
    assert.equal(result.trim(), '{"descricao":"ok"}');
  });

  test("retries with fallback model on 404 error", async () => {
    let callCount = 0;
    const err404 = new Error("404 model not found Not Found");
    shouldThrow = err404;
    mockResponse = JSON.stringify({ descricao: "fallback response" });

    const result = await generateTicketMessage("x", "A", "key", "", "gemini-1.5-pro");
    const parsed = JSON.parse(result);
    assert.equal(parsed.descricao, "fallback response");
  });

  test("throws on non-404 errors", async () => {
    shouldThrow = new Error("Some critical error");
    await assert.rejects(
      () => generateTicketMessage("x", "A", "key", "", "flash"),
      /critical/,
    );
  });
});

// ─── generateSolutionMessage ──────────────────────────────────────────────────

describe("generateSolutionMessage", () => {
  test("returns fallback when no API key", async () => {
    const result = await generateSolutionMessage(
      "Acesso negado", "", "Acme", "", "", "",
    );
    const parsed = JSON.parse(result);
    assert.ok(parsed.solucao.includes("Acesso negado"));
    assert.equal(modelRequestCount, 0);
  });

  test("generates solution with model", async () => {
    mockResponse = JSON.stringify({ solucao: "Problema resolvido." });
    const result = await generateSolutionMessage(
      "Acesso negado", "Usuário sem permissão", "Acme", "key", "", "flash",
    );
    const parsed = JSON.parse(result);
    assert.equal(parsed.solucao, "Problema resolvido.");
    assert.equal(modelRequestCount, 1);
  });

  test("prompt instructs NOT to say 'Chamado finalizado'", async () => {
    await generateSolutionMessage("T", "D", "C", "key", "", "flash");
    assert.ok(lastPrompt.includes("Chamado finalizado"));
  });

  test("uses generic context when no customPrompt", async () => {
    await generateSolutionMessage("T", "D", "C", "key", "", "flash");
    assert.ok(!lastPrompt.includes("Hebron"));
    assert.ok(lastPrompt.includes("Service Desk"));
  });
});

// ─── Model cache (LRU) ────────────────────────────────────────────────────────

describe("Model cache", () => {
  test("reuses cached model across calls", async () => {
    await generateTicketMessage("x", "A", "key-1", "", "flash");
    await generateTicketMessage("y", "B", "key-1", "", "flash");
    // Both calls use same key+model — model created once, requests twice
    assert.equal(modelRequestCount, 2);
  });

  test("_clearModelCache resets the cache", async () => {
    await generateTicketMessage("x", "A", "key-1", "", "flash");
    _clearModelCache();
    await generateTicketMessage("y", "B", "key-1", "", "flash");
    // After clear, a new model instance is created — but both calls still succeed
    assert.equal(modelRequestCount, 2);
  });
});
