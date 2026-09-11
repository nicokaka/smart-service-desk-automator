const test = require("node:test");
const assert = require("node:assert/strict");

const { parseSpreadsheetText } = require("../shared/domain.js");

test("Spreadsheet Parser", async (t) => {
  const mockCatalog = {
    fullDepartments: [
      { id: "dept-1", name: "Suporte Técnico" },
      { id: "dept-2", name: "Financeiro" },
    ],
    fullCategories: [
      { id: "cat-1", name: "Dúvidas", department_id: "dept-1" },
      { id: "cat-2", name: "Boleto", department_id: "dept-2" },
    ],
    fullCustomers: [
      { id: "cust-1", name: "Padaria Real Ltda", email: "real@padaria.com" },
      { id: "cust-2", name: "Acme Corp", email: "admin@acme.com" },
    ],
    operators: [
      { id: "op-1", name: "Carlos Silva" },
      { id: "op-2", name: "Ana Souza" },
    ],
  };

  await t.test("returns empty structure for empty or invalid input", () => {
    assert.deepStrictEqual(parseSpreadsheetText(""), { rows: [], warnings: [], totalParsed: 0 });
    assert.deepStrictEqual(parseSpreadsheetText(null), { rows: [], warnings: [], totalParsed: 0 });
    assert.deepStrictEqual(parseSpreadsheetText("   \n\n  "), { rows: [], warnings: [], totalParsed: 0 });
  });

  await t.test("parses Excel TSV with standard header row and matches catalog", () => {
    const rawTsv = [
      "Cliente\tDepartamento\tCategoria\tAtendente\tResumo\tMensagem",
      "Padaria Real Ltda\tSuporte Técnico\tDúvidas\tCarlos Silva\tInternet lenta\tCaiu de manha",
      "Acme Corp\tFinanceiro\tBoleto\tAna Souza\t2a via boleto\tEnviar por email",
    ].join("\n");

    const result = parseSpreadsheetText(rawTsv, mockCatalog);

    assert.strictEqual(result.totalParsed, 2);
    assert.strictEqual(result.warnings.length, 0);

    const first = result.rows[0];
    assert.strictEqual(first.clientName, "Padaria Real Ltda");
    assert.strictEqual(first.departmentId, "dept-1");
    assert.strictEqual(first.categoryName, "Dúvidas");
    assert.strictEqual(first.attendantId, "op-1");
    assert.strictEqual(first.subject, "Internet lenta");
    assert.strictEqual(first.message, "Caiu de manha");
    assert.strictEqual(first.selected, true);

    const second = result.rows[1];
    assert.strictEqual(second.clientName, "Acme Corp");
    assert.strictEqual(second.departmentId, "dept-2");
    assert.strictEqual(second.categoryName, "Boleto");
    assert.strictEqual(second.attendantId, "op-2");
  });

  await t.test("parses positional TSV without headers", () => {
    const rawTsv = "Acme Corp\tdept-2\tBoleto\top-2\tNota Fiscal\tEmitir NF";

    const result = parseSpreadsheetText(rawTsv, mockCatalog);
    assert.strictEqual(result.totalParsed, 1);
    assert.strictEqual(result.rows[0].clientName, "Acme Corp");
    assert.strictEqual(result.rows[0].departmentId, "dept-2");
    assert.strictEqual(result.rows[0].subject, "Nota Fiscal");
  });

  await t.test("parses CSV with semicolons and case-insensitive matching", () => {
    const rawCsv = [
      "Cliente;Departamento;Resumo",
      "padaria real ltda;suporte técnico;Roteador travado",
    ].join("\n");

    const result = parseSpreadsheetText(rawCsv, mockCatalog);
    assert.strictEqual(result.totalParsed, 1);
    assert.strictEqual(result.rows[0].clientName, "Padaria Real Ltda");
    assert.strictEqual(result.rows[0].departmentId, "dept-1");
    assert.strictEqual(result.rows[0].subject, "Roteador travado");
  });

  await t.test("generates warnings for incomplete mandatory fields without throwing", () => {
    const rawTsv = [
      "Cliente\tDepartamento\tResumo",
      "\tSuporte Técnico\t", // missing client and subject
    ].join("\n");

    const result = parseSpreadsheetText(rawTsv, mockCatalog);
    assert.strictEqual(result.totalParsed, 1);
    assert.strictEqual(result.rows[0].hasWarnings, true);
    assert.ok(result.warnings.length > 0);
  });
});
