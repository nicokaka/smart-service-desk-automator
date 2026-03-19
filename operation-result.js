const RESULT_STATUS = Object.freeze({
  SUCCESS: "success",
  PARTIAL: "partial",
  RETRYABLE_ERROR: "retryable_error",
  FATAL_ERROR: "fatal_error",
});

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    code: error.code || null,
    statusCode: error.statusCode || error.response?.status || null,
    details: error.details || error.response?.data || null,
  };
}

function createResult(status, operation, message, options = {}) {
  return {
    status,
    success: status === RESULT_STATUS.SUCCESS,
    partial: status === RESULT_STATUS.PARTIAL,
    retryable: status === RESULT_STATUS.RETRYABLE_ERROR,
    fatal: status === RESULT_STATUS.FATAL_ERROR,
    operation,
    message,
    data: options.data ?? null,
    errors: options.errors || [],
    warnings: options.warnings || [],
    meta: options.meta || {},
  };
}

function successResult(operation, data, message = "Operacao concluida.", meta = {}) {
  return createResult(RESULT_STATUS.SUCCESS, operation, message, {
    data,
    meta,
  });
}

function partialResult(
  operation,
  message,
  data = null,
  errors = [],
  warnings = [],
  meta = {},
) {
  return createResult(RESULT_STATUS.PARTIAL, operation, message, {
    data,
    errors,
    warnings,
    meta,
  });
}

function retryableErrorResult(operation, error, meta = {}) {
  return createResult(
    RESULT_STATUS.RETRYABLE_ERROR,
    operation,
    error?.message || "Erro temporario.",
    {
      errors: [serializeError(error)].filter(Boolean),
      meta,
    },
  );
}

function fatalErrorResult(operation, error, meta = {}) {
  return createResult(
    RESULT_STATUS.FATAL_ERROR,
    operation,
    error?.message || "Erro fatal.",
    {
      errors: [serializeError(error)].filter(Boolean),
      meta,
    },
  );
}

function combineStatuses(results = []) {
  const statuses = results.map((result) => result?.status).filter(Boolean);

  if (statuses.length === 0) {
    return RESULT_STATUS.FATAL_ERROR;
  }

  if (statuses.every((status) => status === RESULT_STATUS.SUCCESS)) {
    return RESULT_STATUS.SUCCESS;
  }

  if (statuses.some((status) => status === RESULT_STATUS.FATAL_ERROR)) {
    return RESULT_STATUS.PARTIAL;
  }

  if (statuses.some((status) => status === RESULT_STATUS.RETRYABLE_ERROR)) {
    return RESULT_STATUS.PARTIAL;
  }

  return RESULT_STATUS.PARTIAL;
}

function getLogLevel(status) {
  switch (status) {
    case RESULT_STATUS.SUCCESS:
      return "info";
    case RESULT_STATUS.PARTIAL:
      return "warn";
    case RESULT_STATUS.RETRYABLE_ERROR:
      return "warn";
    case RESULT_STATUS.FATAL_ERROR:
    default:
      return "error";
  }
}

module.exports = {
  RESULT_STATUS,
  combineStatuses,
  createResult,
  fatalErrorResult,
  getLogLevel,
  partialResult,
  retryableErrorResult,
  serializeError,
  successResult,
};
