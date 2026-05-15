import test from "node:test";
import assert from "node:assert/strict";
import sharedDomain from "../shared/domain.js";

global.window = { sharedDomain: sharedDomain.default || sharedDomain };

import {
  computeWaitTime,
  createOptionsMarkup,
  dedupeById,
  escapeHtml,
  extractCreatedTicketId,
  filterCategoriesByDepartment,
  findCategoryId,
  findCustomerIdentifier,
  getResultTone,
  hasIncompleteQueueData,
  isPartialStatus,
  isSuccessStatus,
  isPendingGeneratedMessage,
  isPendingSolution,
  parseJsonSafely,
  RESULT_STATUS,
  resultHasUsableData,
} from "../renderer/domain.mjs";

test("escapeHtml sanitizes markup-sensitive characters", () => {
  assert.equal(
    escapeHtml(`"<script>alert('x')</script>"`),
    "&quot;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&quot;",
  );
});

test("createOptionsMarkup keeps placeholder and selected value", () => {
  const markup = createOptionsMarkup(
    [
      { id: "1", name: "TI" },
      { id: "2", name: "Comercial" },
    ],
    {
      selectedValue: "2",
      getValue: (item) => item.id,
      getLabel: (item) => item.name,
    },
  );

  assert.match(markup, /<option value="">Selecione\.\.\.<\/option>/);
  assert.match(markup, /<option value="2" selected>Comercial<\/option>/);
});

test("findCustomerIdentifier prefers id and falls back to email", () => {
  const byId = findCustomerIdentifier(
    [{ id: "123", name: "ACME" }],
    "acme",
  );
  assert.deepEqual(byId, {
    customer: { id: "123", name: "ACME" },
    identifier: "123",
    identifierType: "I",
  });

  const byEmail = findCustomerIdentifier(
    [{ name: "Globex", email: "ti@globex.com" }],
    "Globex",
  );
  assert.deepEqual(byEmail, {
    customer: { name: "Globex", email: "ti@globex.com" },
    identifier: "ti@globex.com",
    identifierType: "E",
  });
});

test("findCategoryId prefers department match before fallback", () => {
  const categories = [
    { id: "a", name: "Rede", department_id: "dep-a" },
    { id: "b", name: "Rede", department_id: "dep-b" },
  ];

  assert.equal(findCategoryId(categories, "dep-b", "Rede"), "b");
  assert.equal(findCategoryId(categories, "dep-c", "Rede"), "a");
  assert.equal(findCategoryId(categories, "dep-c", "Email"), null);
});

test("findCategoryId supports alternate department id fields", () => {
  const categories = [
    { id: "a", name: "Ata", departmentId: "dep-1" },
    { id: "b", name: "Ata", departmentId: "dep-2" },
  ];

  assert.equal(findCategoryId(categories, "dep-2", "Ata"), "b");
});


test("extractCreatedTicketId resolves known response shapes", () => {
  assert.equal(extractCreatedTicketId({ ticket_id: "1" }), "1");
  assert.equal(extractCreatedTicketId({ id: "2" }), "2");
  assert.equal(extractCreatedTicketId({ data: { id: "3" } }), "3");
  assert.equal(extractCreatedTicketId({}), null);
});

test("filterCategoriesByDepartment returns unique sorted names", () => {
  const result = filterCategoriesByDepartment(
    [
      { name: "Rede", department_id: "1" },
      { name: "Email", department_id: "1" },
      { name: "Rede", department_id: "1" },
      { name: "Financeiro", department_id: "2" },
    ],
    "1",
  );

  assert.deepEqual(result, ["Email", "Rede"]);
});

test("filterCategoriesByDepartment falls back to department metadata by name", () => {
  const result = filterCategoriesByDepartment(
    [
      { name: "Ata", department_name: "Diretoria" },
      { name: "Planejamento", department_name: "Diretoria" },
      { name: "VPN", department_name: "TI" },
    ],
    "dep-1",
    [{ id: "dep-1", name: "Diretoria" }],
  );

  assert.deepEqual(result, ["Ata", "Planejamento"]);
});

test("filterCategoriesByDepartment keeps categories available when no department match is found", () => {
  const result = filterCategoriesByDepartment(
    [
      { name: "Ata", department_name: "Diretoria" },
      { name: "Planejamento", department_name: "Diretoria" },
    ],
    "dep-inexistente",
    [{ id: "dep-1", name: "Diretoria" }],
  );

  assert.deepEqual(result, ["Ata", "Planejamento"]);
});

test("computeWaitTime respects turbo and delay settings", () => {
  assert.equal(computeWaitTime({ turbo: true, delaySeconds: "9" }), 100);
  assert.equal(computeWaitTime({ turbo: false, delaySeconds: "3" }), 3000);
  assert.equal(computeWaitTime({ turbo: false, delaySeconds: "x" }), 2000);
});

test("pending state helpers classify transient values correctly", () => {
  assert.equal(isPendingGeneratedMessage(""), true);
  assert.equal(isPendingGeneratedMessage("Erro na IA"), true);
  assert.equal(isPendingGeneratedMessage("Texto final"), false);

  assert.equal(isPendingSolution("Gerando..."), true);
  assert.equal(isPendingSolution("Resolvido"), false);
});

test("dedupeById removes duplicated ids while preserving order", () => {
  const result = dedupeById([
    { id: "1", name: "A" },
    { id: "1", name: "A2" },
    { id: "2", name: "B" },
  ]);

  assert.deepEqual(result, [
    { id: "1", name: "A" },
    { id: "2", name: "B" },
  ]);
});

test("parseJsonSafely returns null for invalid payloads", () => {
  assert.deepEqual(parseJsonSafely('{"descricao":"ok"}'), {
    descricao: "ok",
  });
  assert.equal(parseJsonSafely("{invalid"), null);
});

test("hasIncompleteQueueData lists missing mandatory fields", () => {
  assert.deepEqual(
    hasIncompleteQueueData({
      clientName: "",
      departmentId: "",
      subject: "Teste",
    }),
    ["Cliente", "Departamento"],
  );
});

test("result helpers classify statuses for renderer UX", () => {
  assert.equal(isSuccessStatus(RESULT_STATUS.SUCCESS), true);
  assert.equal(isPartialStatus(RESULT_STATUS.PARTIAL), true);
  assert.equal(getResultTone(RESULT_STATUS.SUCCESS), "info");
  assert.equal(getResultTone(RESULT_STATUS.PARTIAL), "warning");
  assert.equal(getResultTone(RESULT_STATUS.FATAL_ERROR), "error");
  assert.equal(resultHasUsableData({ status: RESULT_STATUS.SUCCESS, data: [] }), true);
  assert.equal(resultHasUsableData({ status: RESULT_STATUS.PARTIAL, data: {} }), true);
  assert.equal(resultHasUsableData({ status: RESULT_STATUS.FATAL_ERROR, data: {} }), false);
});

test("RESULT_STATUS is synchronized with shared operation-result.js", async () => {
  const { RESULT_STATUS: sharedStatus } = await import("../operation-result.js");
  assert.deepEqual(RESULT_STATUS, sharedStatus, "Renderer RESULT_STATUS must match shared operation-result.js RESULT_STATUS");
});
