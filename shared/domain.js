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
};
