const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  createEmptyCatalog,
  normalizeCatalog,
  loadCatalog,
  saveCatalog,
} = require("../catalog-store.js");

test("CatalogStore", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tomticket-catalog-test-"));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  await t.test("createEmptyCatalog returns default departments and categories", () => {
    const catalog = createEmptyCatalog();
    assert.strictEqual(catalog.timestamp, null);
    assert.deepStrictEqual(catalog.departments, ["Administrativo", "Comercial", "TI"]);
    assert.deepStrictEqual(catalog.categories, ["Outros"]);
    assert.deepStrictEqual(catalog.customers, []);
  });

  await t.test("loadCatalog on empty directory returns empty catalog", async () => {
    const catalog = await loadCatalog(tempDir);
    assert.deepStrictEqual(catalog.customers, []);
    assert.deepStrictEqual(catalog.departments, ["Administrativo", "Comercial", "TI"]);
  });

  await t.test("saveCatalog writes atomically and loadCatalog recovers it", async () => {
    const mockData = {
      departments: ["Financeiro", "RH"],
      categories: ["Reembolso"],
      customers: ["Empresa A", "Empresa B"],
      operators: ["Operador 1"],
      fullDepartments: [{ id: "10", name: "Financeiro" }],
      fullCategories: [{ id: "100", name: "Reembolso", department_id: "10" }],
      fullCustomers: [{ id: "c1", name: "Empresa A" }],
    };

    const saveResult = await saveCatalog(mockData, tempDir);
    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.counts.customers, 2);
    assert.ok(saveResult.timestamp);

    const loaded = await loadCatalog(tempDir);
    assert.deepStrictEqual(loaded.departments, ["Financeiro", "RH"]);
    assert.deepStrictEqual(loaded.customers, ["Empresa A", "Empresa B"]);
    assert.deepStrictEqual(loaded.fullDepartments, [{ id: "10", name: "Financeiro" }]);
    assert.strictEqual(loaded.timestamp, saveResult.timestamp);
  });

  await t.test("loadCatalog falls back to .bak when primary file is corrupted", async () => {
    const originalFile = path.join(tempDir, "catalog-cache.json");
    const backupFile = path.join(tempDir, "catalog-cache.json.bak");

    // Ensure we have a valid backup by saving a second time
    const updatedData = {
      departments: ["Fiscal"],
      categories: ["Nota"],
      customers: ["Cliente Backup"],
    };
    await saveCatalog(updatedData, tempDir);

    assert.ok(fs.existsSync(originalFile), "original file exists");
    assert.ok(fs.existsSync(backupFile), "backup file exists");

    // Corrupt the primary file with broken JSON
    fs.writeFileSync(originalFile, "{ broken json content", "utf8");

    // Load catalog should gracefully catch JSON parse error and load the backup
    const recovered = await loadCatalog(tempDir);
    assert.ok(Array.isArray(recovered.customers));
    assert.ok(recovered.customers.length > 0, "Recovered from backup");
  });
});
