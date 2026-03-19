import { setButtonBusy, sleep } from "./common.mjs";
import {
  RESULT_STATUS,
  isPartialStatus,
  isSuccessStatus,
  uniqueSortedNames,
} from "./domain.mjs";
import {
  loadSettingsIntoDom,
  persistSettingsFromDom,
  collectExecutionSettings,
} from "./runtime-settings.mjs";

export function createSettingsController({
  electronAPI,
  log,
  queueController,
  storage = localStorage,
  documentRef = document,
}) {
  const syncButton = documentRef.getElementById("btn-save-settings");
  const accordion = documentRef.getElementById("advanced-accordion");
  const accordionToggle = documentRef.getElementById("advanced-accordion-toggle");
  let initialized = false;

  async function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    await loadSettingsIntoDom(documentRef, electronAPI, storage);
    accordionToggle?.addEventListener("click", () => {
      accordion?.classList.toggle("open");
    });

    syncButton?.addEventListener("click", handleSaveAndSync);
  }

  async function handleSaveAndSync() {
    const currentExecution = collectExecutionSettings(documentRef);
    const settings = await persistSettingsFromDom(
      documentRef,
      electronAPI,
      storage,
    );
    const hasToken = Boolean(settings.token);
    const hasBrowserCredentials = Boolean(
      currentExecution.account &&
        currentExecution.email &&
        currentExecution.password,
    );

    if (!hasToken && !hasBrowserCredentials) {
      window.alert(
        "Informe ao menos o token da API ou as credenciais completas do navegador.",
      );
      return;
    }

    log(
      `Credenciais atualizadas: Conta [${settings.account || "-"}] / Email [${settings.email || "-"}] / Salvar? [${settings.saveCredentials ? "Sim" : "Nao"}]`,
    );

    if (!hasToken) {
      window.alert(
        "Configuracoes salvas. Sem token, a sincronizacao da lista nao sera executada.",
      );
      return;
    }

    const restoreButton = setButtonBusy(
      syncButton,
      '<span class="spinner"></span> Sincronizando...',
    );

    try {
      const syncResult = await syncCatalog(settings.token);
      if (isPartialStatus(syncResult.status)) {
        syncButton.innerText = "Sincronizacao Parcial";
        syncButton.style.backgroundColor = "#f1c40f";
        syncButton.style.color = "#1e1e2e";
        window.alert(syncResult.message);
      } else {
        syncButton.innerText = "Salvo! OK";
        syncButton.style.backgroundColor = "var(--success-color)";
        syncButton.style.color = "#1e1e2e";
      }
    } catch (error) {
      log(`Falha na sincronizacao: ${error.message}`, "error");
      window.alert(`Falha na sincronizacao: ${error.message}`);
    } finally {
      await sleep(1500);
      restoreButton();
    }
  }

  async function syncCatalog(explicitToken = "") {
    const execution = collectExecutionSettings(documentRef);
    const token = explicitToken || execution.token;
    const previousCatalog = queueController.getCatalog();

    if (!token) {
      throw new Error("Token da API nao configurado.");
    }

    log("Sincronizando departamentos, categorias, clientes e atendentes...");

    const syncResponse = await electronAPI.catalog.sync({
      ...execution,
      token,
    });

    if (
      syncResponse.status === RESULT_STATUS.FATAL_ERROR ||
      syncResponse.status === RESULT_STATUS.RETRYABLE_ERROR
    ) {
      throw new Error(syncResponse.message || "Falha ao buscar catalogo.");
    }

    const sections = syncResponse.data?.sections || {};

    const departmentsSection = sections.departments;
    const departments = Array.isArray(departmentsSection?.data)
      ? departmentsSection.data
      : [];

    if (!isSuccessStatus(departmentsSection?.status) || departments.length === 0) {
      throw new Error("A API nao retornou departamentos.");
    }
    const departmentNames = uniqueSortedNames(departments);

    syncButton.innerHTML =
      '<span class="spinner"></span> Sincronizando Atendentes...';

    const operatorsSection = sections.operators;
    const operators = isSuccessStatus(operatorsSection?.status) &&
      Array.isArray(operatorsSection.data)
      ? [...operatorsSection.data].sort((left, right) =>
            left.name.localeCompare(right.name),
          )
        : previousCatalog.operators;

    syncButton.innerHTML =
      '<span class="spinner"></span> Sincronizando Categorias...';

    await sleep(200);
    const categoriesSection = sections.categories;
    const categories = isSuccessStatus(categoriesSection?.status) &&
      Array.isArray(categoriesSection.data)
      ? categoriesSection.data
      : [];
    const nextFullCategories =
      categories.length > 0 ? categories : previousCatalog.fullCategories;
    const nextCategoryNames =
      categories.length > 0
        ? uniqueSortedNames(categories)
        : previousCatalog.categories;

    if (!isSuccessStatus(categoriesSection?.status) && previousCatalog.fullCategories.length > 0) {
      log("Aviso: nenhuma categoria nova retornou. Mantendo cache anterior.");
    }

    syncButton.innerHTML =
      '<span class="spinner"></span> Sincronizando Clientes...';

    await sleep(200);
    const customersSection = sections.customers;
    const customers = isSuccessStatus(customersSection?.status) &&
      Array.isArray(customersSection.data)
      ? customersSection.data
      : previousCatalog.fullCustomers;

    queueController.replaceCatalog({
      fullDepartments: departments,
      departments: departmentNames,
      fullCategories: nextFullCategories,
      categories: nextCategoryNames,
      fullCustomers: customers,
      customers: uniqueSortedNames(customers),
      operators,
    });

    log(`Departamentos atualizados: ${departmentNames.length}`);
    if (nextFullCategories.length !== nextCategoryNames.length) {
      log(
        `Categorias atualizadas: ${nextCategoryNames.length} nomes (${nextFullCategories.length} registros brutos da API).`,
      );
    } else {
      log(`Categorias atualizadas: ${nextCategoryNames.length}`);
    }
    log(`Clientes atualizados: ${customers.length}`);
    log(`Atendentes atualizados: ${operators.length}`);

    if (isPartialStatus(syncResponse.status)) {
      log(syncResponse.message, "warning");
    }

    return syncResponse;
  }

  return {
    init,
    syncCatalog,
  };
}
