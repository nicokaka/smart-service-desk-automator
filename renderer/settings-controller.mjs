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
import { toast } from "./toast.mjs";

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
  const syncTimeSpan = documentRef.getElementById("catalog-sync-time");
  const syncBadge = documentRef.getElementById("sync-status-badge");
  let initialized = false;

  function renderSyncTime(timestamp) {
    if (!syncTimeSpan) return;

    let isStale = false;
    let hasNeverSynced = !timestamp;

    if (!timestamp) {
      syncTimeSpan.innerText = "Catálogo atualizado: Nunca";
      syncTimeSpan.className = "catalog-sync-time color-warning";
    } else {
      try {
        const date = new Date(timestamp);
        syncTimeSpan.innerText = `Catálogo atualizado: ${date.toLocaleString()}`;
        
        const AgeInMs = Date.now() - date.getTime();
        const AgeInHours = AgeInMs / (1000 * 60 * 60);

        if (AgeInHours > 24) {
          isStale = true;
          syncTimeSpan.className = "catalog-sync-time color-warning";
        } else {
          syncTimeSpan.className = "catalog-sync-time color-success";
        }
      } catch {
        syncTimeSpan.innerText = "Catálogo atualizado: Desconhecido";
        syncTimeSpan.className = "catalog-sync-time color-text";
        hasNeverSynced = true;
      }
    }

    if (syncBadge) {
      syncBadge.className = "sync-badge";
      if (hasNeverSynced) {
        syncBadge.classList.add("sync-never");
      } else if (isStale) {
        syncBadge.classList.add("sync-stale");
      } else {
        syncBadge.classList.add("sync-ok");
      }
    }
  }

  async function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    await loadSettingsIntoDom(documentRef, electronAPI, storage);
    
    const catalog = queueController.getCatalog();
    renderSyncTime(catalog.timestamp);

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
      toast.warning(
        "Informe ao menos o token da API ou as credenciais completas do navegador.",
        6000
      );
      return;
    }

    log(
      `Credenciais atualizadas: Conta [${settings.account || "-"}] / Email [${settings.email || "-"}] / Salvar? [${settings.saveCredentials ? "Sim" : "Nao"}]`,
    );

    if (!hasToken) {
      toast.info(
        "Configurações salvas. Sem token, a lista não será sincronizada."
      );
      return;
    }

    const restoreButton = setButtonBusy(
      syncButton,
      '<span class="spinner"></span> Sincronizando...',
    );

    const tableBody = documentRef.getElementById("ticket-queue-body");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr class="skeleton-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="skeleton-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="skeleton-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      `;
    }

    try {
      const syncResult = await syncCatalog(settings.token);
      if (isPartialStatus(syncResult.status)) {
        syncButton.innerText = "Sincronização Parcial";
        syncButton.classList.add("btn-sync-partial");
        syncButton.classList.remove("btn-sync-success");
        toast.warning(syncResult.message);
      } else {
        syncButton.innerText = "Salvo! OK";
        syncButton.classList.add("btn-sync-success");
        syncButton.classList.remove("btn-sync-partial");
      }
    } catch (error) {
      log(`Falha na sincronizacao: ${error.message}`, "error");
      toast.error(`Falha na sincronização: ${error.message}`);
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
      const isOperatorFallback = operatorsSection?.status === RESULT_STATUS.PARTIAL;
      const msg = isOperatorFallback 
        ? "Catálogo sincronizado. (Nota: Atendentes obtidos via busca alternativa)"
        : syncResponse.message;
      log(msg, "warning");
    }

    renderSyncTime(new Date().toISOString());

    return syncResponse;
  }

  return {
    init,
    syncCatalog,
  };
}
