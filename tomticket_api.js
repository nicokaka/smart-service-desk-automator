"use strict";

/**
 * TomTicket REST API client.
 *
 * Uses Node.js built-in `fetch` (available since Node 18).
 * Implements retry with exponential back-off for transient errors.
 */

const {
  RESULT_STATUS,
  fatalErrorResult,
  partialResult,
  retryableErrorResult,
  successResult,
} = require("./operation-result");

const API_BASE_URL = "https://api.tomticket.com/v2.0";
const DEFAULT_TIMEOUT_MS = 15000;

/** HTTP status codes that warrant an automatic retry. */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Network-layer error codes that warrant an automatic retry. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNABORTED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

// ─── Internal helpers ─────────────────────────────────────────────────────────

function createApiError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function isRetryableError(error) {
  return Boolean(
    RETRYABLE_ERROR_CODES.has(error?.code) ||
      RETRYABLE_STATUS_CODES.has(error?.statusCode),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the full URL with query parameters for GET requests.
 */
function buildUrl(endpoint, params, method) {
  const url = `${API_BASE_URL}${endpoint}`;
  if (method === "GET" && params && Object.keys(params).length > 0) {
    return `${url}?${new URLSearchParams(params).toString()}`;
  }
  return url;
}

// ─── HTTP layer (fetch-based) ─────────────────────────────────────────────────

/**
 * Perform a single HTTP request using the built-in `fetch`.
 * Returns a normalized { statusCode, body } object.
 *
 * @throws on network-level failures (no response received)
 */
async function sendHttpRequest({ operation, endpoint, token, method = "GET", params = {} }) {
  const url = buildUrl(endpoint, params, method);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body;
  if (method === "POST") {
    // TomTicket v2 API uses application/x-www-form-urlencoded for mutations
    body = new URLSearchParams(params).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const responseText = await response.text();

    return {
      operation,
      url,
      method,
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
    };
  } catch (fetchError) {
    // AbortController timeout surfaces as AbortError
    if (fetchError.name === "AbortError") {
      throw createApiError(
        `[${operation}] HTTP timeout after ${DEFAULT_TIMEOUT_MS}ms`,
        { code: "ETIMEDOUT" },
      );
    }

    // Propagate with a normalized code so isRetryableError can classify it
    const code = fetchError.cause?.code || fetchError.code || "ECONNRESET";
    throw createApiError(
      `[${operation}] HTTP transport failed: ${fetchError.message}`,
      { cause: fetchError, code },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Response normalization ───────────────────────────────────────────────────

function normalizeResponse(operation, rawResponse) {
  let parsedBody = null;

  if (rawResponse.body) {
    try {
      parsedBody = JSON.parse(rawResponse.body);
    } catch {
      throw createApiError(
        `[${operation}] Failed to parse JSON response from TomTicket.`,
        {
          statusCode: rawResponse.statusCode,
          responseBody: rawResponse.body,
        },
      );
    }
  }

  if (rawResponse.statusCode >= 200 && rawResponse.statusCode < 300) {
    return {
      ok: true,
      payload: parsedBody,
      data: parsedBody?.data ?? parsedBody,
      meta: { statusCode: rawResponse.statusCode },
    };
  }

  const error = createApiError(
    `[${operation}] TomTicket responded with HTTP ${rawResponse.statusCode}.`,
    {
      statusCode: rawResponse.statusCode,
      responseBody: parsedBody ?? rawResponse.body,
      code: `HTTP_${rawResponse.statusCode}`,
    },
  );

  if (parsedBody?.message) {
    error.message = `[${operation}] ${parsedBody.message}`;
  }

  throw error;
}

// ─── Retry logic ──────────────────────────────────────────────────────────────

async function requestWithRetry({
  operation,
  endpoint,
  token,
  method = "GET",
  params = {},
  maxAttempts = 3,
  backoffMs = 1000,
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const rawResponse = await sendHttpRequest({ operation, endpoint, token, method, params });
      const normalized = normalizeResponse(operation, rawResponse);

      return successResult(
        operation,
        normalized.data,
        `[${operation}] Request completed successfully.`,
        {
          attempts: attempt,
          statusCode: normalized.meta.statusCode,
          payload: normalized.payload,
        },
      );
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxAttempts) {
        break;
      }

      const delay = backoffMs * attempt;
      console.warn(`[${operation}] Retryable error (attempt ${attempt}/${maxAttempts}), waiting ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }

  if (isRetryableError(lastError)) {
    return retryableErrorResult(operation, lastError, { attempts: maxAttempts });
  }

  return fatalErrorResult(operation, lastError, { attempts: maxAttempts });
}

// ─── Array assertion helper ───────────────────────────────────────────────────

function ensureArray(operation, result) {
  if (result.status !== RESULT_STATUS.SUCCESS) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return fatalErrorResult(
      operation,
      createApiError(`[${operation}] Expected array response from TomTicket.`, {
        details: result.data,
      }),
      result.meta,
    );
  }

  return result;
}

// ─── Public API functions ─────────────────────────────────────────────────────

async function getTickets(token, filters = {}) {
  const operation = "tickets:list";
  const result = await requestWithRetry({
    operation,
    endpoint: "/ticket/list",
    token,
    method: "GET",
    params: {
      page: 1,
      situation: "0,1,2,3,6,7,8,9,10,11",
      ...filters,
    },
  });

  return ensureArray(operation, result);
}

async function getDepartments(token) {
  const operation = "catalog:departments";
  const result = await requestWithRetry({
    operation,
    endpoint: "/department/list",
    token,
    method: "GET",
  });

  return ensureArray(operation, result);
}

async function getCategories(token, departmentId) {
  const operation = `catalog:categories:${departmentId}`;
  const result = await requestWithRetry({
    operation,
    endpoint: "/department/category/list",
    token,
    method: "GET",
    params: { department_id: departmentId },
  });

  return ensureArray(operation, result);
}

async function getCustomers(token) {
  const operation = "catalog:customers";
  const customers = [];
  let page = 1;

  while (page <= 1000) {
    const pageResult = await requestWithRetry({
      operation: `${operation}:page:${page}`,
      endpoint: "/customer/list",
      token,
      method: "GET",
      params: { page },
    });

    if (pageResult.status !== RESULT_STATUS.SUCCESS) {
      if (customers.length > 0) {
        return partialResult(
          operation,
          `[${operation}] Customer sync stopped on page ${page}.`,
          customers,
          pageResult.errors,
          pageResult.warnings,
          { failedPage: page, partialCount: customers.length },
        );
      }

      return pageResult.status === RESULT_STATUS.RETRYABLE_ERROR
        ? retryableErrorResult(
            operation,
            createApiError(`[${operation}] Failed before any customer page was loaded.`, {
              details: pageResult.errors,
            }),
            { failedPage: page },
          )
        : fatalErrorResult(
            operation,
            createApiError(`[${operation}] Failed before any customer page was loaded.`, {
              details: pageResult.errors,
            }),
            { failedPage: page },
          );
    }

    if (!Array.isArray(pageResult.data)) {
      return fatalErrorResult(
        operation,
        createApiError(`[${operation}] Customer page ${page} did not return an array.`, {
          details: pageResult.data,
        }),
        { failedPage: page },
      );
    }

    customers.push(...pageResult.data);

    if (
      pageResult.data.length === 0 ||
      pageResult.meta?.payload?.next_page === null
    ) {
      break;
    }

    page += 1;
    await sleep(200);
  }

  return successResult(
    operation,
    customers,
    `[${operation}] Customer sync completed.`,
    { total: customers.length },
  );
}

async function getOperators(token) {
  const directResult = await requestWithRetry({
    operation: "catalog:operators",
    endpoint: "/operator/list",
    token,
    method: "GET",
  });

  if (directResult.status === RESULT_STATUS.SUCCESS) {
    if (!Array.isArray(directResult.data)) {
      return fatalErrorResult(
        "catalog:operators",
        createApiError("[catalog:operators] Expected array response from TomTicket."),
        directResult.meta,
      );
    }

    if (directResult.data.length > 0) {
      return directResult;
    }
  }

  // Fallback: extract operators from ticket scan (up to 5 pages)
  const extractedOperators = [];
  const seenOperators = new Set();
  const extractionErrors = [];

  for (let page = 1; page <= 5; page += 1) {
    const ticketResult = await requestWithRetry({
      operation: `catalog:operators:ticket-scan:${page}`,
      endpoint: "/ticket/list",
      token,
      method: "GET",
      params: { page, limit: 100 },
      maxAttempts: 2,
    });

    if (ticketResult.status !== RESULT_STATUS.SUCCESS) {
      extractionErrors.push(...ticketResult.errors);
      continue;
    }

    if (!Array.isArray(ticketResult.data) || ticketResult.data.length === 0) {
      break;
    }

    ticketResult.data.forEach((ticket) => {
      if (ticket.operator?.id && !seenOperators.has(ticket.operator.id)) {
        seenOperators.add(ticket.operator.id);
        extractedOperators.push(ticket.operator);
      }
    });
  }

  if (extractedOperators.length > 0) {
    return partialResult(
      "catalog:operators",
      "[catalog:operators] Operators resolved through ticket scan fallback.",
      extractedOperators,
      directResult.errors,
      extractionErrors,
      { strategy: "ticket_scan" },
    );
  }

  if (directResult.status === RESULT_STATUS.RETRYABLE_ERROR) {
    return retryableErrorResult(
      "catalog:operators",
      createApiError("[catalog:operators] Operator lookup failed in all strategies."),
      { directResult, extractionErrors },
    );
  }

  return fatalErrorResult(
    "catalog:operators",
    createApiError("[catalog:operators] Operator lookup failed in all strategies."),
    { directResult, extractionErrors },
  );
}

async function createTicket(token, ticketData) {
  return requestWithRetry({
    operation: "tickets:create",
    endpoint: "/ticket/new",
    token,
    method: "POST",
    params: ticketData,
    maxAttempts: 2,
    backoffMs: 1200,
  });
}

async function finalizeTicket(token, ticketId, message) {
  return requestWithRetry({
    operation: `tickets:finish:${ticketId}`,
    endpoint: "/ticket/finish",
    token,
    method: "POST",
    params: { ticket_id: ticketId, message },
    maxAttempts: 2,
    backoffMs: 1200,
  });
}

async function linkAttendant(token, ticketId, operatorId) {
  return requestWithRetry({
    operation: `tickets:link-operator:${ticketId}`,
    endpoint: "/ticket/operator/link",
    token,
    method: "POST",
    params: { ticket_id: ticketId, operator_id: operatorId },
    maxAttempts: 2,
    backoffMs: 1200,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  RESULT_STATUS,
  createTicket,
  finalizeTicket,
  getCategories,
  getCustomers,
  getDepartments,
  getOperators,
  getTickets,
  linkAttendant,
  // Interne para testes
  _isRetryableError: isRetryableError,
  _normalizeResponse: normalizeResponse,
};
