const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const STORE_FILE_NAME = "config-store.json";
const DEFAULT_SETTINGS = {
  account: "",
  email: "",
  password: "",
  browser: "chromium",
  token: "",
  apiKey: "",
  customPrompt: "",
  model: "gemini-2.5-flash",
  delay: "2",
  turboMode: false,
  debugMode: false,
  saveCredentials: false,
};
const SUPPORTED_BROWSERS = new Set(["chromium", "firefox"]);

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeBoolean(value) {
  return value === true || value === "true";
}

function normalizeBrowser(value) {
  const normalized = normalizeString(value, "chromium").toLowerCase();
  return SUPPORTED_BROWSERS.has(normalized) ? normalized : "chromium";
}

function normalizeSettings(settings = {}) {
  return {
    account: normalizeString(settings.account),
    email: normalizeString(settings.email),
    password: typeof settings.password === "string" ? settings.password : "",
    browser: normalizeBrowser(settings.browser),
    token: normalizeString(settings.token),
    apiKey: normalizeString(settings.apiKey),
    customPrompt: typeof settings.customPrompt === "string"
      ? settings.customPrompt.trim()
      : "",
    model: normalizeString(settings.model, DEFAULT_SETTINGS.model) || DEFAULT_SETTINGS.model,
    delay: String(settings.delay ?? DEFAULT_SETTINGS.delay),
    turboMode: normalizeBoolean(settings.turboMode),
    debugMode: normalizeBoolean(settings.debugMode),
    saveCredentials: normalizeBoolean(settings.saveCredentials),
  };
}

function getStorePath() {
  return path.join(app.getPath("userData"), STORE_FILE_NAME);
}

function readStoreFile() {
  try {
    const filePath = getStorePath();
    if (!fs.existsSync(filePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeStoreFile(data) {
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function encodeSecret(secret) {
  if (!secret) {
    return null;
  }

  if (safeStorage.isEncryptionAvailable()) {
    return {
      scheme: "safeStorage",
      value: safeStorage.encryptString(secret).toString("base64"),
    };
  }

  return {
    scheme: "plain",
    value: secret,
  };
}

function decodeSecret(payload) {
  if (!payload || typeof payload !== "object" || !payload.value) {
    return "";
  }

  if (payload.scheme === "safeStorage" && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(payload.value, "base64"));
    } catch {
      return "";
    }
  }

  if (payload.scheme === "plain") {
    return payload.value;
  }

  return "";
}

function buildPersistedStore(settings) {
  const normalized = normalizeSettings(settings);

  return {
    public: {
      account: normalized.account,
      email: normalized.email,
      browser: normalized.browser,
      customPrompt: normalized.customPrompt,
      model: normalized.model,
      delay: normalized.delay,
      turboMode: normalized.turboMode,
      debugMode: normalized.debugMode,
      saveCredentials: normalized.saveCredentials,
    },
    secrets: {
      token: encodeSecret(normalized.token),
      apiKey: encodeSecret(normalized.apiKey),
      password: normalized.saveCredentials
        ? encodeSecret(normalized.password)
        : null,
    },
  };
}

function readSettings() {
  const rawStore = readStoreFile();
  const publicSettings = rawStore.public || {};
  const secrets = rawStore.secrets || {};

  return {
    ...DEFAULT_SETTINGS,
    ...publicSettings,
    token: decodeSecret(secrets.token),
    apiKey: decodeSecret(secrets.apiKey),
    password: decodeSecret(secrets.password),
  };
}

function saveSettings(partialSettings = {}) {
  const currentSettings = readSettings();
  const nextSettings = normalizeSettings({
    ...currentSettings,
    ...partialSettings,
  });

  if (!nextSettings.saveCredentials) {
    nextSettings.password = "";
  }

  writeStoreFile(buildPersistedStore(nextSettings));
  return nextSettings;
}

function mergeSettings(overrides = {}) {
  return normalizeSettings({
    ...readSettings(),
    ...overrides,
  });
}

module.exports = {
  getSettings: readSettings,
  saveSettings,
  mergeSettings,
};
