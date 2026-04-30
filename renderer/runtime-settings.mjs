export const STORAGE_KEYS = {
  queueState: "ticketQueueState",
  cachedDepartments: "cachedDepartments",
  cachedFullDepartments: "cachedFullDepartments",
  cachedCategories: "cachedCategories",
  cachedFullCategories: "cachedFullCategories",
  cachedCustomers: "cachedCustomers",
  cachedFullCustomers: "cachedFullCustomers",
  cachedOperators: "cachedOperators",
  catalogTimestamp: "catalogTimestamp",
};

const LEGACY_RENDERER_SETTINGS_KEYS = [
  "tomticketAccount",
  "tomticketEmail",
  "tomticketPassword",
  "tomticketBrowser",
  "tomticketToken",
  "geminiApiKey",
  "customAIPrompt",
  "saveCredentialsState",
  "turboMode",
  "geminiModel",
  "antiSpamDelay",
  "debugMode",
];

function parseStoredJson(storage, key, fallback) {
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function readLegacySettings(storage = localStorage) {
  return {
    account: storage.getItem("tomticketAccount") || "",
    email: storage.getItem("tomticketEmail") || "",
    password: storage.getItem("tomticketPassword") || "",
    browser: storage.getItem("tomticketBrowser") || "chromium",
    token: storage.getItem("tomticketToken") || "",
    apiKey: storage.getItem("geminiApiKey") || "",
    customPrompt: storage.getItem("customAIPrompt") || "",
    saveCredentials: storage.getItem("saveCredentialsState") === "true",
    turboMode: storage.getItem("turboMode") === "true",
    model: storage.getItem("geminiModel") || "gemini-2.5-flash",
    delay: storage.getItem("antiSpamDelay") || "2",
    debugMode: storage.getItem("debugMode") === "true",
  };
}

function hasLegacySensitiveSettings(legacySettings) {
  return Boolean(
    legacySettings.token || legacySettings.password || legacySettings.apiKey,
  );
}

function hasPersistedSensitiveSettings(settings) {
  return Boolean(settings.token || settings.password || settings.apiKey);
}

function clearLegacyRendererSettings(storage = localStorage) {
  LEGACY_RENDERER_SETTINGS_KEYS.forEach((key) => storage.removeItem(key));
}

function applySettingsToDom(settings, documentRef = document) {
  const byId = (id) => documentRef.getElementById(id);

  if (byId("apiToken")) {
    byId("apiToken").value = settings.token || "";
  }

  if (byId("settings-account")) {
    byId("settings-account").value = settings.account || "";
  }

  if (byId("settings-email")) {
    byId("settings-email").value = settings.email || "";
  }

  if (byId("settings-password")) {
    byId("settings-password").value = settings.password || "";
  }

  if (byId("settings-browser")) {
    byId("settings-browser").value = settings.browser || "chromium";
  }

  if (byId("geminiApiKey")) {
    byId("geminiApiKey").value = settings.apiKey || "";
  }

  if (byId("customAIPrompt")) {
    byId("customAIPrompt").value = settings.customPrompt || "";
  }

  if (byId("settings-gemini-model")) {
    byId("settings-gemini-model").value =
      settings.model || "gemini-2.5-flash";
  }

  if (byId("settings-delay")) {
    byId("settings-delay").value = settings.delay || "2";
  }

  if (byId("chk-save-credentials")) {
    byId("chk-save-credentials").checked = Boolean(settings.saveCredentials);
  }

  if (byId("chk-turbo-mode")) {
    byId("chk-turbo-mode").checked = Boolean(settings.turboMode);
  }

  if (byId("chk-debug-mode")) {
    byId("chk-debug-mode").checked = Boolean(settings.debugMode);
  }
}

export function loadCatalogSnapshot(storage = localStorage) {
  return {
    timestamp: storage.getItem(STORAGE_KEYS.catalogTimestamp) || null,
    departments: parseStoredJson(storage, STORAGE_KEYS.cachedDepartments, [
      "Administrativo",
      "Comercial",
      "TI",
    ]),
    categories: parseStoredJson(storage, STORAGE_KEYS.cachedCategories, [
      "Outros",
    ]),
    customers: parseStoredJson(storage, STORAGE_KEYS.cachedCustomers, []),
    operators: parseStoredJson(storage, STORAGE_KEYS.cachedOperators, []),
    fullDepartments: parseStoredJson(
      storage,
      STORAGE_KEYS.cachedFullDepartments,
      [],
    ),
    fullCategories: parseStoredJson(
      storage,
      STORAGE_KEYS.cachedFullCategories,
      [],
    ),
    fullCustomers: parseStoredJson(storage, STORAGE_KEYS.cachedFullCustomers, []),
  };
}

function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.error(`[Storage] Falha ao salvar "${key}" (${value?.length} chars):`, error.message);
  }
}

export function saveCatalogSnapshot(snapshot, storage = localStorage) {
  safeSetItem(
    storage,
    STORAGE_KEYS.catalogTimestamp,
    new Date().toISOString()
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedDepartments,
    JSON.stringify(snapshot.departments || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedCategories,
    JSON.stringify(snapshot.categories || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedCustomers,
    JSON.stringify(snapshot.customers || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedOperators,
    JSON.stringify(snapshot.operators || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedFullDepartments,
    JSON.stringify(snapshot.fullDepartments || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedFullCategories,
    JSON.stringify(snapshot.fullCategories || []),
  );
  safeSetItem(
    storage,
    STORAGE_KEYS.cachedFullCustomers,
    JSON.stringify(snapshot.fullCustomers || []),
  );
}

export function loadQueueState(storage = localStorage) {
  return parseStoredJson(storage, STORAGE_KEYS.queueState, []);
}

export function saveQueueState(rows, storage = localStorage) {
  safeSetItem(storage, STORAGE_KEYS.queueState, JSON.stringify(rows));
}

export async function loadSettingsIntoDom(
  documentRef = document,
  electronAPI = window.electronAPI,
  storage = localStorage,
) {
  let response = await electronAPI.settings.load();
  if (!response.success) {
    throw new Error(response.message || "Falha ao carregar configuracoes.");
  }

  let settings = response.data || {};
  const legacySettings = readLegacySettings(storage);

  if (
    hasLegacySensitiveSettings(legacySettings) &&
    !hasPersistedSensitiveSettings(settings)
  ) {
    const migrated = await electronAPI.settings.save(legacySettings);
    if (!migrated.success) {
      throw new Error(migrated.message || "Falha ao migrar configuracoes antigas.");
    }
    settings = migrated.data || settings;
  }

  clearLegacyRendererSettings(storage);
  applySettingsToDom(settings, documentRef);
  return settings;
}

function collectSettingsFromDom(documentRef = document) {
  const byId = (id) => documentRef.getElementById(id);

  return {
    account: byId("settings-account")?.value.trim() || "",
    email: byId("settings-email")?.value.trim() || "",
    password: byId("settings-password")?.value || "",
    browser: byId("settings-browser")?.value || "chromium",
    token: byId("apiToken")?.value.trim() || "",
    apiKey: byId("geminiApiKey")?.value.trim() || "",
    customPrompt: byId("customAIPrompt")?.value.trim() || "",
    saveCredentials: Boolean(byId("chk-save-credentials")?.checked),
    turboMode: Boolean(byId("chk-turbo-mode")?.checked),
    model: byId("settings-gemini-model")?.value || "gemini-2.5-flash",
    delay: byId("settings-delay")?.value || "2",
    debugMode: Boolean(byId("chk-debug-mode")?.checked),
  };
}

export async function persistSettingsFromDom(
  documentRef = document,
  electronAPI = window.electronAPI,
  storage = localStorage,
) {
  const response = await electronAPI.settings.save(
    collectSettingsFromDom(documentRef),
  );

  if (!response.success) {
    throw new Error(response.message || "Falha ao salvar configuracoes.");
  }

  clearLegacyRendererSettings(storage);
  applySettingsToDom(response.data || {}, documentRef);
  return response.data || {};
}

export function collectExecutionSettings(documentRef = document) {
  return {
    account: documentRef.getElementById("settings-account")?.value.trim() || "",
    email: documentRef.getElementById("settings-email")?.value.trim() || "",
    password: documentRef.getElementById("settings-password")?.value || "",
    browser:
      documentRef.getElementById("settings-browser")?.value || "chromium",
    token: documentRef.getElementById("apiToken")?.value.trim() || "",
    delay: documentRef.getElementById("settings-delay")?.value || "2",
    turboMode: Boolean(documentRef.getElementById("chk-turbo-mode")?.checked),
    debugMode: Boolean(documentRef.getElementById("chk-debug-mode")?.checked),
  };
}

export function collectAiSettings(documentRef = document) {
  return {
    apiKey: documentRef.getElementById("geminiApiKey")?.value.trim() || "",
    customPrompt:
      documentRef.getElementById("customAIPrompt")?.value.trim() || "",
    model:
      documentRef.getElementById("settings-gemini-model")?.value ||
      "gemini-2.5-flash",
    debugMode: Boolean(documentRef.getElementById("chk-debug-mode")?.checked),
  };
}
