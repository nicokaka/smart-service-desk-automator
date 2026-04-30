"use strict";

/**
 * Tests for shared/domain.js
 * Run with: node --test tests/shared-domain.test.cjs
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeString,
  computeWaitTime,
  findCustomerIdentifier,
  findCategoryId,
  buildCreatePayload,
  extractCreatedTicketId,
  isPendingGeneratedMessage,
  isPendingSolution,
  dedupeById,
  hasIncompleteQueueData,
} = require("../shared/domain");

// ─── normalizeString ──────────────────────────────────────────────────────────

describe("normalizeString", () => {
  test("trims whitespace", () => {
    assert.equal(normalizeString("  hello  "), "hello");
  });

  test("returns fallback for non-string", () => {
    assert.equal(normalizeString(null, "default"), "default");
    assert.equal(normalizeString(undefined, "x"), "x");
    assert.equal(normalizeString(42, "y"), "y");
  });

  test("returns empty string fallback by default", () => {
    assert.equal(normalizeString(null), "");
  });
});

// ─── computeWaitTime ─────────────────────────────────────────────────────────

describe("computeWaitTime", () => {
  test("returns 100ms in turbo mode (turboMode boolean)", () => {
    assert.equal(computeWaitTime({ turboMode: true }), 100);
  });

  test("returns 100ms in turbo mode (turboMode string)", () => {
    assert.equal(computeWaitTime({ turboMode: "true" }), 100);
  });

  test("returns 100ms in turbo mode (turbo alias)", () => {
    assert.equal(computeWaitTime({ turbo: true }), 100);
  });

  test("converts delay seconds to ms", () => {
    assert.equal(computeWaitTime({ delay: "3" }), 3000);
    assert.equal(computeWaitTime({ delay: "0" }), 0);
  });

  test("uses delaySeconds alias", () => {
    assert.equal(computeWaitTime({ delaySeconds: "5" }), 5000);
  });

  test("defaults to 2s on invalid delay", () => {
    assert.equal(computeWaitTime({ delay: "not-a-number" }), 2000);
    assert.equal(computeWaitTime({}), 2000);
  });

  test("clamps negative delay to 0", () => {
    assert.equal(computeWaitTime({ delay: "-5" }), 0);
  });
});

// ─── findCustomerIdentifier ───────────────────────────────────────────────────

describe("findCustomerIdentifier", () => {
  const customers = [
    { id: "1", name: "Acme Corp" },
    { name: "Beta Ltd", email: "contact@beta.com" },
    { name: "Gamma" },
  ];

  test("finds by exact name (case-insensitive)", () => {
    const result = findCustomerIdentifier(customers, "acme corp");
    assert.deepEqual(result, { customer: customers[0], identifier: "1", identifierType: "I" });
  });

  test("falls back to email identifier", () => {
    const result = findCustomerIdentifier(customers, "Beta Ltd");
    assert.deepEqual(result, { customer: customers[1], identifier: "contact@beta.com", identifierType: "E" });
  });

  test("returns null if customer not found", () => {
    assert.equal(findCustomerIdentifier(customers, "Unknown"), null);
  });

  test("returns null for empty client name", () => {
    assert.equal(findCustomerIdentifier(customers, ""), null);
    assert.equal(findCustomerIdentifier(customers, "   "), null);
  });

  test("returns null if no id and no email", () => {
    assert.equal(findCustomerIdentifier(customers, "Gamma"), null);
  });

  test("handles null/empty customers array", () => {
    assert.equal(findCustomerIdentifier([], "Acme"), null);
    assert.equal(findCustomerIdentifier(null, "Acme"), null);
  });

  test("uses alternative ID fields", () => {
    const customers2 = [{ customer_id: "c99", name: "Delta" }];
    const result = findCustomerIdentifier(customers2, "Delta");
    assert.deepEqual(result, { customer: customers2[0], identifier: "c99", identifierType: "I" });
  });
});

// ─── findCategoryId ───────────────────────────────────────────────────────────

describe("findCategoryId", () => {
  const categories = [
    { id: "cat1", name: "Hardware", department_id: "dept1" },
    { id: "cat2", name: "Software", department_id: "dept1" },
    { id: "cat3", name: "Hardware", department_id: "dept2" },
  ];

  test("prefers match within same department", () => {
    assert.equal(findCategoryId(categories, "dept1", "Hardware"), "cat1");
    assert.equal(findCategoryId(categories, "dept2", "Hardware"), "cat3");
  });

  test("falls back to any department if no dept match", () => {
    assert.equal(findCategoryId(categories, "dept999", "Software"), "cat2");
  });

  test("returns null for empty category name", () => {
    assert.equal(findCategoryId(categories, "dept1", ""), null);
    assert.equal(findCategoryId(categories, "dept1", "  "), null);
  });

  test("returns null if not found", () => {
    assert.equal(findCategoryId(categories, "dept1", "Networking"), null);
  });

  test("handles null arrays", () => {
    assert.equal(findCategoryId(null, "dept1", "Hardware"), null);
  });
});

// ─── buildCreatePayload ───────────────────────────────────────────────────────

describe("buildCreatePayload", () => {
  const baseRow = {
    departmentId: "dept1",
    subject: "Problema de rede",
    message: "Internet lenta desde ontem.",
  };
  const identifierI = { identifier: "cust1", identifierType: "I" };
  const identifierE = { identifier: "user@corp.com", identifierType: "E" };

  test("builds base payload", () => {
    const payload = buildCreatePayload(baseRow, identifierI, null);
    assert.equal(payload.department_id, "dept1");
    assert.equal(payload.subject, "Problema de rede");
    assert.equal(payload.message, "Internet lenta desde ontem.");
    assert.equal(payload.priority, "2");
    assert.equal(payload.customer_id, "cust1");
    assert.equal(payload.category_id, undefined);
    assert.equal(payload.customer_id_type, undefined);
  });

  test("includes category_id when provided", () => {
    const payload = buildCreatePayload(baseRow, identifierI, "cat99");
    assert.equal(payload.category_id, "cat99");
  });

  test("adds customer_id_type=E for email identifiers", () => {
    const payload = buildCreatePayload(baseRow, identifierE, null);
    assert.equal(payload.customer_id, "user@corp.com");
    assert.equal(payload.customer_id_type, "E");
  });

  test("falls back message to subject when message is empty", () => {
    const rowNoMessage = { ...baseRow, message: "" };
    const payload = buildCreatePayload(rowNoMessage, identifierI, null);
    assert.equal(payload.message, "Problema de rede");
  });
});

// ─── extractCreatedTicketId ───────────────────────────────────────────────────

describe("extractCreatedTicketId", () => {
  test("reads ticket_id first", () => {
    assert.equal(extractCreatedTicketId({ ticket_id: "T1", id: "X" }), "T1");
  });

  test("falls back to id", () => {
    assert.equal(extractCreatedTicketId({ id: "T2" }), "T2");
  });

  test("falls back to data.id", () => {
    assert.equal(extractCreatedTicketId({ data: { id: "T3" } }), "T3");
  });

  test("returns null when nothing found", () => {
    assert.equal(extractCreatedTicketId({}), null);
    assert.equal(extractCreatedTicketId(null), null);
  });
});

// ─── isPendingGeneratedMessage ────────────────────────────────────────────────

describe("isPendingGeneratedMessage", () => {
  test("detects pending states", () => {
    assert.equal(isPendingGeneratedMessage(""), true);
    assert.equal(isPendingGeneratedMessage("Gerando..."), true);
    assert.equal(isPendingGeneratedMessage("Erro na IA"), true);
    assert.equal(isPendingGeneratedMessage("Falha (Limite)"), true);
  });

  test("returns false for completed message", () => {
    assert.equal(isPendingGeneratedMessage("O cliente solicitou acesso."), false);
  });

  test("trims whitespace before checking", () => {
    assert.equal(isPendingGeneratedMessage("  "), true);
  });
});

// ─── isPendingSolution ────────────────────────────────────────────────────────

describe("isPendingSolution", () => {
  test("detects pending solution states", () => {
    assert.equal(isPendingSolution(""), true);
    assert.equal(isPendingSolution("Gerando..."), true);
    assert.equal(isPendingSolution("Erro na IA."), true);
  });

  test("returns false for real solution text", () => {
    assert.equal(isPendingSolution("Acesso liberado com sucesso."), false);
  });
});

// ─── dedupeById ──────────────────────────────────────────────────────────────

describe("dedupeById", () => {
  test("removes duplicates by id", () => {
    const items = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "1", name: "A-dup" },
    ];
    const result = dedupeById(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "A");
    assert.equal(result[1].name, "B");
  });

  test("skips items without id", () => {
    const items = [{ name: "No ID" }, { id: "1", name: "A" }];
    const result = dedupeById(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "A");
  });

  test("handles null/empty", () => {
    assert.deepEqual(dedupeById(null), []);
    assert.deepEqual(dedupeById([]), []);
  });
});

// ─── hasIncompleteQueueData ────────────────────────────────────────────────────

describe("hasIncompleteQueueData", () => {
  test("returns empty array for complete row", () => {
    const row = { clientName: "Acme", departmentId: "dept1", subject: "Problema" };
    assert.deepEqual(hasIncompleteQueueData(row), []);
  });

  test("reports missing client", () => {
    const missing = hasIncompleteQueueData({ departmentId: "d1", subject: "s" });
    assert.ok(missing.includes("Cliente"));
  });

  test("reports missing department", () => {
    const missing = hasIncompleteQueueData({ clientName: "A", subject: "s" });
    assert.ok(missing.includes("Departamento"));
  });

  test("reports missing subject", () => {
    const missing = hasIncompleteQueueData({ clientName: "A", departmentId: "d1" });
    assert.ok(missing.includes("Resumo"));
  });

  test("reports all missing fields for empty row", () => {
    const missing = hasIncompleteQueueData({});
    assert.equal(missing.length, 3);
  });
});
