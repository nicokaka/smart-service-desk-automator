export const RESULT_STATUS = Object.freeze({
  SUCCESS: "success",
  PARTIAL: "partial",
  RETRYABLE_ERROR: "retryable_error",
  FATAL_ERROR: "fatal_error",
});

function normalizeString(value) {
  return String(value ?? "").trim();
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

function getDepartmentNameLike(value) {
  return normalizeString(
    value?.department_name ??
      value?.departmentName ??
      value?.department?.name ??
      value?.name,
  );
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createOptionsMarkup(
  items,
  {
    selectedValue = "",
    placeholder = "Selecione...",
    getValue = (item) => item,
    getLabel = (item) => item,
  } = {},
) {
  const normalizedSelected = String(selectedValue ?? "");
  const options = items.map((item) => {
    const value = String(getValue(item) ?? "");
    const label = String(getLabel(item) ?? "");
    const selected = value === normalizedSelected ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  });

  return [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...options,
  ].join("");
}

export function uniqueSortedNames(items) {
  return Array.from(
    new Set(
      (items || [])
        .map((item) => normalizeString(item?.name ?? item))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterCategoriesByDepartment(
  categories,
  departmentId,
  departments = [],
) {
  const allCategoryNames = uniqueSortedNames(categories || []);
  const normalizedDepartmentId = normalizeString(departmentId);

  if (!normalizedDepartmentId) {
    return allCategoryNames;
  }

  const matchedDepartment = (departments || []).find((department) => {
    return (
      getDepartmentIdLike(department) === normalizedDepartmentId ||
      getDepartmentNameLike(department) === normalizedDepartmentId
    );
  });

  const expectedDepartmentId =
    getDepartmentIdLike(matchedDepartment) || normalizedDepartmentId;
  const expectedDepartmentName = getDepartmentNameLike(matchedDepartment);

  const filtered = (categories || []).filter((category) => {
    const categoryDepartmentId = getDepartmentIdLike(category);
    const categoryDepartmentName = getDepartmentNameLike(category);

    return (
      categoryDepartmentId === expectedDepartmentId ||
      (expectedDepartmentName &&
        categoryDepartmentName &&
        categoryDepartmentName.toLowerCase() ===
          expectedDepartmentName.toLowerCase())
    );
  });

  const filteredNames = uniqueSortedNames(filtered);
  return filteredNames.length > 0 ? filteredNames : allCategoryNames;
}

export function findCustomerIdentifier(customers, clientName) {
  const normalizedClient = normalizeString(clientName).toLowerCase();
  if (!normalizedClient) {
    return null;
  }

  const customer = (customers || []).find((item) => {
    return normalizeString(item?.name).toLowerCase() === normalizedClient;
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
    return {
      customer,
      identifier,
      identifierType: "I",
    };
  }

  if (customer.email) {
    return {
      customer,
      identifier: customer.email,
      identifierType: "E",
    };
  }

  return {
    customer,
    identifier: null,
    identifierType: null,
  };
}

export function findCategoryId(categories, departmentId, categoryName) {
  const normalizedCategory = normalizeString(categoryName);
  const normalizedDepartmentId = normalizeString(departmentId);
  if (!normalizedCategory) {
    return null;
  }

  const preferredMatch = (categories || []).find((category) => {
    return (
      normalizeString(category?.name) === normalizedCategory &&
      getDepartmentIdLike(category) === normalizedDepartmentId
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

export function buildCreateTicketPayload({
  departmentId,
  subject,
  message,
  categoryId,
  customerIdentifier,
}) {
  const payload = {
    department_id: normalizeString(departmentId),
    subject: normalizeString(subject),
    message: normalizeString(message) || normalizeString(subject),
    priority: "2",
    customer_id: customerIdentifier?.identifier,
  };

  if (categoryId) {
    payload.category_id = categoryId;
  }

  if (customerIdentifier?.identifierType === "E") {
    payload.customer_id_type = "E";
  }

  return payload;
}

export function extractCreatedTicketId(responseData) {
  return (
    responseData?.ticket_id ||
    responseData?.id ||
    responseData?.data?.id ||
    null
  );
}

export function isPendingGeneratedMessage(message) {
  const normalized = normalizeString(message);
  return (
    normalized === "" ||
    normalized === "Gerando..." ||
    normalized === "Erro na IA" ||
    normalized === "Falha (Limite)"
  );
}

export function isPendingSolution(message) {
  const normalized = normalizeString(message);
  return (
    normalized === "" ||
    normalized === "Gerando..." ||
    normalized === "Erro na IA."
  );
}

export function computeWaitTime({ turbo, delaySeconds }) {
  if (turbo) {
    return 100;
  }

  const parsed = Number.parseInt(delaySeconds, 10);
  const seconds = Number.isFinite(parsed) ? Math.max(parsed, 0) : 2;
  return seconds * 1000;
}

export function dedupeById(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items || []) {
    const identifier = item?.id;
    if (!identifier || seen.has(identifier)) {
      continue;
    }

    seen.add(identifier);
    deduped.push(item);
  }

  return deduped;
}

export function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function hasIncompleteQueueData(row) {
  const missingFields = [];

  if (!normalizeString(row?.clientName)) {
    missingFields.push("Cliente");
  }

  if (!normalizeString(row?.departmentId)) {
    missingFields.push("Departamento");
  }

  if (!normalizeString(row?.subject)) {
    missingFields.push("Resumo");
  }

  return missingFields;
}

export function getResultTone(status) {
  switch (status) {
    case RESULT_STATUS.SUCCESS:
      return "info";
    case RESULT_STATUS.PARTIAL:
      return "warning";
    case RESULT_STATUS.RETRYABLE_ERROR:
      return "warning";
    case RESULT_STATUS.FATAL_ERROR:
    default:
      return "error";
  }
}

export function isSuccessStatus(status) {
  return status === RESULT_STATUS.SUCCESS;
}

export function isPartialStatus(status) {
  return status === RESULT_STATUS.PARTIAL;
}

export function resultHasUsableData(result) {
  return Boolean(
    result &&
      (result.status === RESULT_STATUS.SUCCESS ||
        result.status === RESULT_STATUS.PARTIAL) &&
      result.data !== null &&
      result.data !== undefined,
  );
}
