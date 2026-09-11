"use strict";

const fs = require("fs");
const path = require("path");
let electronApp = null;

try {
  const electron = require("electron");
  electronApp = electron.app || null;
} catch {
  electronApp = null;
}

const CATALOG_FILE_NAME = "catalog-cache.json";
const BACKUP_FILE_NAME = "catalog-cache.json.bak";
const TMP_FILE_NAME = "catalog-cache.json.tmp";

const DEFAULT_DEPARTMENTS = ["Administrativo", "Comercial", "TI"];
const DEFAULT_CATEGORIES = ["Outros"];

function createEmptyCatalog() {
  return {
    timestamp: null,
    departments: [...DEFAULT_DEPARTMENTS],
    categories: [...DEFAULT_CATEGORIES],
    customers: [],
    operators: [],
    fullDepartments: [],
    fullCategories: [],
    fullCustomers: [],
  };
}

function getCatalogDirectory() {
  if (electronApp && typeof electronApp.getPath === "function") {
    try {
      return electronApp.getPath("userData");
    } catch {
      // Fallback if called outside ready lifecycle or in test
    }
  }
  return process.env.APPDATA || process.env.HOME || process.cwd();
}

function resolvePaths(customDir = null) {
  const baseDir = customDir || getCatalogDirectory();
  return {
    baseDir,
    targetFile: path.join(baseDir, CATALOG_FILE_NAME),
    backupFile: path.join(baseDir, BACKUP_FILE_NAME),
    tmpFile: path.join(baseDir, TMP_FILE_NAME),
  };
}

function normalizeCatalog(raw) {
  if (!raw || typeof raw !== "object") {
    return createEmptyCatalog();
  }

  return {
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : null,
    departments: Array.isArray(raw.departments) && raw.departments.length > 0
      ? raw.departments
      : [...DEFAULT_DEPARTMENTS],
    categories: Array.isArray(raw.categories) && raw.categories.length > 0
      ? raw.categories
      : [...DEFAULT_CATEGORIES],
    customers: Array.isArray(raw.customers) ? raw.customers : [],
    operators: Array.isArray(raw.operators) ? raw.operators : [],
    fullDepartments: Array.isArray(raw.fullDepartments) ? raw.fullDepartments : [],
    fullCategories: Array.isArray(raw.fullCategories) ? raw.fullCategories : [],
    fullCustomers: Array.isArray(raw.fullCustomers) ? raw.fullCustomers : [],
  };
}

/**
 * Loads the catalog cache from disk.
 * Falls back to .bak if the primary file is corrupted.
 * Returns default empty catalog if no files exist or both are corrupted.
 */
async function loadCatalog(customDir = null) {
  const { targetFile, backupFile } = resolvePaths(customDir);

  // 1. Try primary file
  try {
    if (fs.existsSync(targetFile)) {
      const content = await fs.promises.readFile(targetFile, "utf8");
      const parsed = JSON.parse(content);
      return normalizeCatalog(parsed);
    }
  } catch (primaryError) {
    console.warn(
      `[CatalogStore] Falha ao ler ${targetFile} (${primaryError.message}). Tentando backup...`
    );
  }

  // 2. Try backup file
  try {
    if (fs.existsSync(backupFile)) {
      const backupContent = await fs.promises.readFile(backupFile, "utf8");
      const parsedBackup = JSON.parse(backupContent);
      console.info(`[CatalogStore] Catalogo recuperado com sucesso a partir do backup.`);
      return normalizeCatalog(parsedBackup);
    }
  } catch (backupError) {
    console.error(
      `[CatalogStore] Falha ao ler backup ${backupFile}: ${backupError.message}`
    );
  }

  return createEmptyCatalog();
}

/**
 * Saves the catalog cache to disk using atomic rename.
 * Also keeps a .bak copy for high durability.
 */
async function saveCatalog(catalogData, customDir = null) {
  const { baseDir, targetFile, backupFile, tmpFile } = resolvePaths(customDir);

  const normalized = normalizeCatalog(catalogData);
  normalized.timestamp = new Date().toISOString();

  const serialized = JSON.stringify(normalized, null, 2);

  await fs.promises.mkdir(baseDir, { recursive: true });

  // 1. Write to temporary file
  await fs.promises.writeFile(tmpFile, serialized, "utf8");

  // 2. Rotate existing target to backup if exists
  try {
    if (fs.existsSync(targetFile)) {
      await fs.promises.copyFile(targetFile, backupFile);
    }
  } catch (backupErr) {
    console.warn(`[CatalogStore] Nao foi possivel rotacionar backup:`, backupErr.message);
  }

  // 3. Atomic rename tmp to target
  await fs.promises.rename(tmpFile, targetFile);

  return {
    success: true,
    timestamp: normalized.timestamp,
    counts: {
      customers: normalized.customers.length,
      departments: normalized.departments.length,
      categories: normalized.categories.length,
      operators: normalized.operators.length,
    },
  };
}

module.exports = {
  createEmptyCatalog,
  normalizeCatalog,
  loadCatalog,
  saveCatalog,
  resolvePaths,
};
