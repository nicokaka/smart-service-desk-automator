/**
 * Renderer-side domain module (ES Module).
 *
 * Business logic that is RENDERER-ONLY lives here.
 * Logic shared with the main process is re-exported from shared/domain.js
 * (loaded via window.sharedDomain injected by preload, or directly imported
 * in testable contexts).
 *
 * NOTE: In Electron's renderer with contextIsolation, we cannot directly
 * `require('./shared/domain')`. Instead, the pure functions are duplicated
 * here ONLY for UI-specific helpers. All overlap was resolved by moving
 * shared logic to shared/domain.js and updating main.js to import from there.
 */

/* SYNC: Must match RESULT_STATUS in operation-result.js */
export const RESULT_STATUS = Object.freeze({
  SUCCESS: "success",
  PARTIAL: "partial",
  RETRYABLE_ERROR: "retryable_error",
  FATAL_ERROR: "fatal_error",
});

// window.sharedDomain is injected by preload.js in Electron, or mocked in Node tests.
const getShared = () => typeof window !== "undefined" ? window.sharedDomain : {};

/**
 * BUG-F: Safe delegate wrapper.
 * If window.sharedDomain hasn't been injected yet (timing race on init),
 * calling getShared().someFunction() would throw "undefined is not a function"
 * with no useful context. This wrapper surfaces a clear error.
 */
function safeDelegate(name) {
  return (...args) => {
    const shared = getShared();
    if (typeof shared[name] !== "function") {
      const msg = `[domain.mjs] window.sharedDomain.${name} not available yet. Ensure preload.js loaded before calling renderer domain functions.`;
      console.error(msg);
      throw new Error(msg);
    }
    return shared[name](...args);
  };
}

export const normalizeString = safeDelegate("normalizeString");
export const computeWaitTime = safeDelegate("computeWaitTime");
export const findCustomerIdentifier = safeDelegate("findCustomerIdentifier");
export const findCategoryId = safeDelegate("findCategoryId");
export const extractCreatedTicketId = safeDelegate("extractCreatedTicketId");
export const isPendingGeneratedMessage = safeDelegate("isPendingGeneratedMessage");
export const isPendingSolution = safeDelegate("isPendingSolution");
export const dedupeById = safeDelegate("dedupeById");
export const hasIncompleteQueueData = safeDelegate("hasIncompleteQueueData");



// ─── Status sentinels ─────────────────────────────────────────────────────────

// ─── Department / category metadata helpers ───────────────────────────────────

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

// ─── HTML escaping ────────────────────────────────────────────────────────────

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ─── Select option markup ─────────────────────────────────────────────────────

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

// ─── Name utilities ───────────────────────────────────────────────────────────

export function uniqueSortedNames(items) {
  return Array.from(
    new Set(
      (items || [])
        .map((item) => normalizeString(item?.name ?? item))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

// ─── Category / department filtering ─────────────────────────────────────────

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

// ─── Shared functions are now imported at the top ────────────────────────────────





// ─── JSON parsing ─────────────────────────────────────────────────────────────

export function parseJsonSafely(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}



// ─── Result helpers ───────────────────────────────────────────────────────────

export function getResultTone(status) {
  switch (status) {
    case RESULT_STATUS.SUCCESS:
      return "info";
    case RESULT_STATUS.PARTIAL:
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

// ─── Safe querySelector with escaped ID ──────────────────────────────────────

/**
 * Safely finds a <tr> by its data-id attribute.
 * Using attribute selector [data-id="..."] avoids CSS injection risks
 * from untrusted ticket IDs coming from the API.
 *
 * @param {Document} documentRef
 * @param {string} id
 * @returns {Element | null}
 */
export function findRowById(documentRef, id) {
  if (!id) {
    return null;
  }

  // Escape backslashes and double quotes to prevent attribute selector injection
  const safeId = String(id).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return documentRef.querySelector(`tr[data-id="${safeId}"]`);
}
