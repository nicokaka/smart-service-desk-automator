"use strict";

/**
 * Shared domain utilities — usable in both the main process (CommonJS)
 * and re-exported by the renderer's domain.mjs.
 *
 * Keep this file free of any Electron, Node.js, or browser-only APIs.
 */

const { RESULT_STATUS } = require("../operation-result.js");

// ─── String and metadata helpers ─────────────────────────────────────────────

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getDepartmentIdLike(value) {
  return normalizeString(
    value?.department_id ??
      value?.departmentId ??
      value?.department?.id ??
      value?.department?.department_id ??
      value?.id,
  );
}

/**
 * Compute the inter-request delay in milliseconds.
 * @param {{ turboMode?: boolean, turbo?: boolean, delay?: string, delaySeconds?: string }} settings
 */
function computeWaitTime(settings) {
  const isTurbo =
    settings.turboMode === true ||
    settings.turboMode === "true" ||
    settings.turbo === true;

  if (isTurbo) {
    return 100;
  }

  const raw = settings.delay ?? settings.delaySeconds ?? "2";
  const parsed = Number.parseInt(raw, 10);
  return (Number.isFinite(parsed) ? Math.max(parsed, 0) : 2) * 1000;
}

// ─── Customer lookup ─────────────────────────────────────────────────────────

/**
 * Find a customer from the catalog by name (case-insensitive).
 * Returns an object with { identifier, identifierType } or null.
 *
 * @param {Array} customers
 * @param {string} clientName
 * @returns {{ customer?: object, identifier: string, identifierType: "I"|"E" } | null}
 */
function findCustomerIdentifier(customers, clientName) {
  const normalizedClient = normalizeString(clientName);
  if (!normalizedClient) {
    return null;
  }

  const customer = (customers || []).find((item) => {
    return normalizeString(item?.name).localeCompare(normalizedClient, undefined, { sensitivity: 'base' }) === 0;
  });

  if (!customer) {
    return null;
  }

  const identifier =
    customer.id ||
    customer.Id ||
    customer.customer_id ||
    customer.key ||
    customer._id ||
    null;

  if (identifier) {
    return { customer, identifier, identifierType: "I" };
  }

  if (customer.email) {
    return { customer, identifier: customer.email, identifierType: "E" };
  }

  return null;
}

// ─── Category lookup ─────────────────────────────────────────────────────────

/**
 * Find a category ID by name, preferring matches within the given department.
 *
 * @param {Array} categories
 * @param {string} departmentId
 * @param {string} categoryName
 * @returns {string | null}
 */
function findCategoryId(categories, departmentId, categoryName) {
  const normalizedCategory = normalizeString(categoryName);
  if (!normalizedCategory) {
    return null;
  }

  const preferredMatch = (categories || []).find((category) => {
    return (
      normalizeString(category?.name) === normalizedCategory &&
      getDepartmentIdLike(category) === normalizeString(departmentId)
    );
  });

  if (preferredMatch?.id) {
    return preferredMatch.id;
  }

  const fallbackMatch = (categories || []).find((category) => {
    return normalizeString(category?.name) === normalizedCategory;
  });

  return fallbackMatch?.id ?? null;
}

// ─── Ticket payload ───────────────────────────────────────────────────────────

/**
 * Build the payload for the TomTicket create-ticket API call.
 * Note: renderer/domain.mjs has a similar function but with a destructuring signature.
 *
 * @param {object} row - Queue row data
 * @param {{ identifier: string, identifierType: "I"|"E" }} customerIdentifier
 * @param {string | null} categoryId
 */
function buildCreatePayload(row, customerIdentifier, categoryId) {
  const payload = {
    department_id: normalizeString(row.departmentId),
    subject: normalizeString(row.subject),
    message: normalizeString(row.message) || normalizeString(row.subject),
    priority: "2",
    customer_id: customerIdentifier.identifier,
  };

  if (categoryId) {
    payload.category_id = categoryId;
  }

  if (customerIdentifier.identifierType === "E") {
    payload.customer_id_type = "E";
  }

  return payload;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Extract the created ticket ID from various API response shapes.
 * @param {object | null} responseData
 * @returns {string | null}
 */
function extractCreatedTicketId(responseData) {
  return (
    responseData?.ticket_id ||
    responseData?.id ||
    responseData?.data?.id ||
    null
  );
}

// ─── Status sentinel checks ───────────────────────────────────────────────────

const PENDING_MESSAGES = new Set([
  "",
  "Gerando...",
  "Erro na IA",
  "Falha (Limite)",
]);

const PENDING_SOLUTIONS = new Set(["", "Gerando...", "Erro na IA."]);

function isPendingGeneratedMessage(message) {
  return PENDING_MESSAGES.has(normalizeString(message));
}

function isPendingSolution(message) {
  return PENDING_SOLUTIONS.has(normalizeString(message));
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function dedupeById(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const id = item?.id;
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push(item);
  }

  return result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns an array of missing field names for a queue row.
 * Empty array means the row is valid.
 *
 * @param {object} row
 * @returns {string[]}
 */
function hasIncompleteQueueData(row) {
  const missing = [];

  if (!normalizeString(row?.clientName)) missing.push("Cliente");
  if (!normalizeString(row?.departmentId)) missing.push("Departamento");
  if (!normalizeString(row?.subject)) missing.push("Resumo");

  return missing;
}

// ─── Spreadsheet / Clipboard Parsing ─────────────────────────────────────────

const HEADER_ALIASES = {
  client: ["cliente", "empresa", "client", "customer", "razao social", "razão social", "nome"],
  department: ["departamento", "depto", "dept", "setor", "área", "area"],
  category: ["categoria", "cat", "tipo", "subcategoria"],
  attendant: ["atendente", "operador", "responsavel", "responsável", "operator"],
  subject: ["resumo", "assunto", "titulo", "título", "subject", "problema", "o que aconteceu"],
  message: ["mensagem", "descricao", "descrição", "message", "detalhes", "corpo"],
};

function matchHeaderField(headerText) {
  const normalized = normalizeString(headerText).toLowerCase();
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized === `${alias}:`)) {
      return field;
    }
  }
  return null;
}

function parseSpreadsheetText(rawText, catalog = {}) {
  if (!rawText || typeof rawText !== "string") {
    return { rows: [], warnings: [], totalParsed: 0 };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], warnings: [], totalParsed: 0 };
  }

  // Detect delimiter: tab takes precedence for spreadsheet copies
  const firstLine = lines[0];
  let delimiter = "\t";
  if (!firstLine.includes("\t")) {
    if (firstLine.includes(";")) {
      delimiter = ";";
    } else if (firstLine.includes(",")) {
      delimiter = ",";
    }
  }

  const splitRow = (line) => line.split(delimiter).map((cell) => normalizeString(cell));

  // Determine if first row is a header (require at least 2 matched headers, or 1 if multi-line)
  const firstRowCells = splitRow(firstLine);
  const matchedHeaders = firstRowCells.map(matchHeaderField);
  const validHeaderCount = matchedHeaders.filter((h) => h !== null).length;
  const isHeaderRow = validHeaderCount >= 2 || (lines.length > 1 && validHeaderCount >= 1);

  const columnMap = {};
  let dataLines = lines;

  if (isHeaderRow) {
    matchedHeaders.forEach((field, index) => {
      if (field && columnMap[field] === undefined) {
        columnMap[field] = index;
      }
    });
    dataLines = lines.slice(1);
  } else {
    // Default standard order: Cliente, Departamento, Categoria, Atendente, Resumo, Mensagem
    columnMap.client = 0;
    columnMap.department = 1;
    columnMap.category = 2;
    columnMap.attendant = 3;
    columnMap.subject = 4;
    columnMap.message = 5;
  }

  const fullDepts = Array.isArray(catalog.fullDepartments) ? catalog.fullDepartments : [];
  const fullCats = Array.isArray(catalog.fullCategories) ? catalog.fullCategories : [];
  const fullCusts = Array.isArray(catalog.fullCustomers) ? catalog.fullCustomers : [];
  const simpleCusts = Array.isArray(catalog.customers) ? catalog.customers : [];
  const allCusts = fullCusts.length > 0 ? fullCusts : simpleCusts;
  const operators = Array.isArray(catalog.operators) ? catalog.operators : [];

  const rows = [];
  const warnings = [];

  dataLines.forEach((line, lineIndex) => {
    const cells = splitRow(line);
    // Ignore rows that are completely empty cells
    if (cells.every((c) => c === "")) {
      return;
    }

    const rawClient = columnMap.client !== undefined ? (cells[columnMap.client] || "") : "";
    const rawDept = columnMap.department !== undefined ? (cells[columnMap.department] || "") : "";
    const rawCat = columnMap.category !== undefined ? (cells[columnMap.category] || "") : "";
    const rawAttendant = columnMap.attendant !== undefined ? (cells[columnMap.attendant] || "") : "";
    const rawSubject = columnMap.subject !== undefined ? (cells[columnMap.subject] || "") : "";
    const rawMessage = columnMap.message !== undefined ? (cells[columnMap.message] || "") : "";

    // 1. Resolve client
    let resolvedClient = rawClient;
    if (rawClient) {
      const match = allCusts.find((c) => {
        const name = typeof c === "string" ? c : (c.name || c.nome || "");
        return normalizeString(name).localeCompare(rawClient, undefined, { sensitivity: "base" }) === 0;
      });
      if (match) {
        resolvedClient = typeof match === "string" ? match : (match.name || match.nome || rawClient);
      }
    }

    // 2. Resolve department
    let resolvedDeptId = "";
    if (rawDept) {
      const match = fullDepts.find((d) => {
        const deptId = String(d.id || d.department_id || "");
        const deptName = String(d.name || d.nome || "");
        return (
          deptId === rawDept ||
          normalizeString(deptName).localeCompare(rawDept, undefined, { sensitivity: "base" }) === 0
        );
      });
      resolvedDeptId = match ? String(match.id || match.department_id) : rawDept;
    }

    // 3. Resolve category
    let resolvedCatName = rawCat;
    if (rawCat) {
      const match = fullCats.find((c) => {
        const catName = String(c.name || c.nome || "");
        return normalizeString(catName).localeCompare(rawCat, undefined, { sensitivity: "base" }) === 0;
      });
      if (match) {
        resolvedCatName = match.name || match.nome || rawCat;
      }
    }

    // 4. Resolve attendant
    let resolvedAttendantId = "";
    if (rawAttendant) {
      const match = operators.find((op) => {
        const opId = String(op.id || op.operator_id || "");
        const opName = String(op.name || op.nome || "");
        return (
          opId === rawAttendant ||
          normalizeString(opName).localeCompare(rawAttendant, undefined, { sensitivity: "base" }) === 0
        );
      });
      resolvedAttendantId = match ? String(match.id || match.operator_id) : rawAttendant;
    }

    const rowWarnings = [];
    if (!resolvedClient) rowWarnings.push("Cliente ausente");
    if (!resolvedDeptId) rowWarnings.push("Departamento ausente");
    if (!rawSubject) rowWarnings.push("Resumo ausente");

    if (rowWarnings.length > 0) {
      warnings.push(`Linha ${lineIndex + 1}: ${rowWarnings.join(", ")}`);
    }

    rows.push({
      clientName: resolvedClient,
      departmentId: resolvedDeptId,
      categoryName: resolvedCatName,
      attendantId: resolvedAttendantId,
      subject: rawSubject,
      message: rawMessage,
      selected: true,
      hasWarnings: rowWarnings.length > 0,
      warningDetails: rowWarnings,
    });
  });

  return {
    rows,
    warnings,
    totalParsed: rows.length,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  RESULT_STATUS,
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
  parseSpreadsheetText,
};
