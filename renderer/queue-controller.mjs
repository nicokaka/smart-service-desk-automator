import { $, $$, sleep, setButtonBusy } from "./common.mjs";
import {
  computeWaitTime,
  createOptionsMarkup,
  escapeHtml,
  filterCategoriesByDepartment,
  findRowById,
  hasIncompleteQueueData,
  isPendingGeneratedMessage,
  isPartialStatus,
  RESULT_STATUS,
  parseJsonSafely,
  getResultTone,
  parseSpreadsheetText,
} from "./domain.mjs";
import {
  loadCatalogSnapshot,
  loadQueueState,
  collectAiSettings,
  collectExecutionSettings,
  saveCatalogSnapshot,
  saveQueueState,
} from "./runtime-settings.mjs";
import { toast } from "./toast.mjs";
import { showConfirmDialog } from "./confirm-modal.mjs";

export function createQueueController({
  electronAPI,
  log,
  storage = localStorage,
  documentRef = document,
}) {
  const elements = {
    tableBody: documentRef.getElementById("ticket-queue-body"),
    addRowButton: documentRef.getElementById("btn-add-row"),
    removeSelectedButton: documentRef.getElementById("btn-remove-selected"),
    selectAllCheckbox: documentRef.getElementById("select-all"),
    generateAiButton: documentRef.getElementById("btn-generate-ai"),
    startBotButton: documentRef.getElementById("btn-start-bot"),
    emptyState: documentRef.getElementById("queue-empty-state"),
    clientsList: documentRef.getElementById("clients-list"),
    retryFailedButton: documentRef.getElementById("btn-retry-failed"),
    importSpreadsheetButton: documentRef.getElementById("btn-import-spreadsheet"),
    importModal: documentRef.getElementById("import-modal"),
    closeImportButton: documentRef.getElementById("btn-close-import"),
    cancelImportButton: documentRef.getElementById("btn-cancel-import"),
    confirmImportButton: documentRef.getElementById("btn-confirm-import"),
    importTextarea: documentRef.getElementById("txt-import-content"),
    readClipboardButton: documentRef.getElementById("btn-read-clipboard"),
    importBadge: documentRef.getElementById("import-count-badge"),
    importFeedback: documentRef.getElementById("import-feedback"),
  };

  let rowCount = 0;
  let catalog = loadCatalogSnapshot(storage);
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    renderClientDatalist();
    restoreQueueState();
    bindEvents();
    toggleQueueEmptyState();
    toggleRemoveButton();
    updateRetryFailedButton();
    updateCatalogHeaderStatus();

    if (electronAPI?.catalog?.loadCache) {
      electronAPI.catalog
        .loadCache()
        .then((res) => {
          if (res?.status === "success" && res.data && res.data.timestamp) {
            replaceCatalog(res.data, { persist: false });
          }
        })
        .catch((err) => {
          console.warn("[QueueController] Falha ao carregar cache em disco:", err);
        });
    }
  }

  function bindEvents() {
    elements.selectAllCheckbox?.addEventListener("change", () => {
      $$(".row-select", elements.tableBody).forEach((checkbox) => {
        checkbox.checked = elements.selectAllCheckbox.checked;
      });
      toggleRemoveButton();
    });

    elements.removeSelectedButton?.addEventListener("click", () => {
      $$(".row-select:checked", elements.tableBody).forEach((checkbox) => {
        checkbox.closest("tr")?.remove();
      });
      saveCurrentQueueState();
      toggleRemoveButton();
      toggleQueueEmptyState();
      updateRetryFailedButton();
    });

    elements.addRowButton?.addEventListener("click", () => {
      addRow();
    });

    elements.retryFailedButton?.addEventListener("click", handleRetryFailedRows);
    elements.importSpreadsheetButton?.addEventListener("click", () => openImportModal());
    elements.closeImportButton?.addEventListener("click", closeImportModal);
    elements.cancelImportButton?.addEventListener("click", closeImportModal);
    elements.confirmImportButton?.addEventListener("click", handleConfirmImport);
    elements.importTextarea?.addEventListener("input", updateImportPreview);
    elements.readClipboardButton?.addEventListener("click", handleReadClipboard);

    documentRef.getElementById("queue")?.addEventListener("paste", (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      const pasted = e.clipboardData?.getData("text") || "";
      if (pasted.trim()) {
        openImportModal(pasted);
      }
    });

    window.addEventListener("keydown", handleGlobalKeyDown);

    elements.generateAiButton?.addEventListener("click", handleGenerateAi);
    elements.startBotButton?.addEventListener("click", handleCreateTickets);
  }

  function replaceCatalog(nextCatalog, { persist = true } = {}) {
    catalog = {
      ...catalog,
      ...nextCatalog,
    };

    if (persist) {
      saveCatalogSnapshot(catalog, storage);
      if (electronAPI?.catalog?.saveCache) {
        electronAPI.catalog.saveCache(catalog).catch(() => {});
      }
    }

    renderClientDatalist();
    refreshExistingRows();
    updateCatalogHeaderStatus();
  }

  function updateCatalogHeaderStatus() {
    const statusEl = documentRef.getElementById("queue-catalog-status");
    if (!statusEl) {
      return;
    }

    const deptCount = catalog.fullDepartments?.length || 0;
    const clientCount = catalog.customers?.length || 0;
    const opCount = catalog.operators?.length || 0;

    if (deptCount > 0 || clientCount > 0) {
      statusEl.className = "catalog-status-indicator connected";
      statusEl.innerHTML = `<span class="status-dot">●</span> Catálogo conectado: <strong>${deptCount}</strong> depts • <strong>${clientCount}</strong> clientes • <strong>${opCount}</strong> atendentes`;
    } else {
      statusEl.className = "catalog-status-indicator warning";
      statusEl.innerHTML = `<span class="status-dot">●</span> Catálogo não sincronizado. Acesse <strong>Credenciais</strong> para sincronizar.`;
    }
  }

  function getCustomerPlaceholder() {
    const count = catalog.customers?.length || 0;
    return count > 0 ? `Selecione o Cliente (${count})...` : "Selecione o Cliente...";
  }

  function getDeptPlaceholder() {
    const count = catalog.fullDepartments?.length || 0;
    return count > 0 ? `Selecione o Depto (${count})...` : "Selecione o Depto...";
  }

  function getOperatorPlaceholder() {
    const count = catalog.operators?.length || 0;
    return count > 0 ? `Selecione o Atendente (${count})...` : "Selecione o Atendente...";
  }

  function getCategoryPlaceholder(departmentId, categoryCount = 0) {
    if (!departmentId) {
      return "Selecione primeiro o Depto...";
    }
    return categoryCount > 0
      ? `Selecione a Categoria (${categoryCount})...`
      : "Nenhuma categoria cadastrada";
  }

  function getCatalog() {
    return { ...catalog };
  }

  function renderClientDatalist() {
    if (!elements.clientsList) {
      return;
    }

    elements.clientsList.innerHTML = catalog.customers
      .map(
        (customerName) =>
          `<option value="${escapeHtml(customerName)}"></option>`,
      )
      .join("");
  }

  function toggleQueueEmptyState() {
    if (!elements.tableBody || !elements.emptyState) {
      return;
    }

    const hasRows = elements.tableBody.querySelectorAll("tr").length > 0;
    elements.emptyState.classList.toggle("hidden", hasRows);

    if (elements.selectAllCheckbox) {
      elements.selectAllCheckbox.disabled = !hasRows;
      if (!hasRows) {
        elements.selectAllCheckbox.checked = false;
      }
    }
  }

  function toggleRemoveButton() {
    if (!elements.removeSelectedButton) {
      return;
    }

    const checkedCount = $$(".row-select:checked", elements.tableBody).length;
    elements.removeSelectedButton.classList.toggle("hidden", checkedCount === 0);
  }

  function createRowMarkup(data = {}) {
    const departmentOptions = createOptionsMarkup(catalog.fullDepartments, {
      selectedValue: data.departmentId,
      placeholder: getDeptPlaceholder(),
      getValue: (department) => department.id,
      getLabel: (department) => department.name,
    });

    const filteredCategories = filterCategoriesByDepartment(
      catalog.fullCategories,
      data.departmentId || "",
      catalog.fullDepartments,
    );

    const categoryOptions = createOptionsMarkup(
      filteredCategories,
      {
        selectedValue: data.categoryName,
        placeholder: getCategoryPlaceholder(
          data.departmentId,
          filteredCategories.length,
        ),
      },
    );

    const customerOptions = createOptionsMarkup(catalog.customers, {
      selectedValue: data.clientName,
      placeholder: getCustomerPlaceholder(),
    });

    const operatorOptions = createOptionsMarkup(catalog.operators, {
      selectedValue: data.attendantId,
      placeholder: getOperatorPlaceholder(),
      getValue: (operator) => operator.id,
      getLabel: (operator) => operator.name,
    });

    return `
      <td><input type="checkbox" class="row-select"${
        data.selected ? " checked" : ""
      }></td>
      <td>
        <select class="input-client input-field">
          ${customerOptions}
        </select>
      </td>
      <td>
        <select class="input-dept input-field">
          ${departmentOptions}
        </select>
      </td>
      <td>
        <select class="input-cat input-field">
          ${categoryOptions}
        </select>
      </td>
      <td>
        <select class="input-attendant input-field">
          ${operatorOptions}
        </select>
      </td>
      <td><textarea placeholder="Ex: Internet lenta" class="input-summary" rows="3">${escapeHtml(data.subject || "")}</textarea></td>
      <td><textarea placeholder="Pode digitar ou gerar com IA..." class="input-message" rows="3">${escapeHtml(data.message || "")}</textarea></td>
    `;
  }

  function addRow(data = null) {
    if (!elements.tableBody) {
      return null;
    }

    rowCount += 1;
    const row = documentRef.createElement("tr");
    row.dataset.id = String(rowCount);
    row.innerHTML = createRowMarkup(data || {});

    bindRow(row, data || {});
    elements.tableBody.appendChild(row);

    if (data?.status === "success") {
      markRowAsSuccess(row);
    } else if (data?.status === "partial") {
      markRowAsPartial(row);
    } else if (data?.status === "error") {
      markRowAsError(row);
    }

    toggleQueueEmptyState();

    if (!data) {
      saveCurrentQueueState();
    }

    return row;
  }

  function bindRow(row, data) {
    const checkbox = $(".row-select", row);
    const departmentSelect = $(".input-dept", row);

    checkbox?.addEventListener("change", toggleRemoveButton);

    departmentSelect?.addEventListener("change", () => {
      updateCategoryOptions(row, {
        selectedCategoryName: "",
      });
      debouncedSaveQueueState(50);
    });

    updateCategoryOptions(row, {
      selectedCategoryName: data.categoryName || "",
    });

    $$("input, select, textarea", row).forEach((input) => {
      input.addEventListener("change", () => {
        validateRowFields(row);
        debouncedSaveQueueState(50);
      });
      input.addEventListener("input", () => {
        validateRowFields(row);
        debouncedSaveQueueState(300);
      });
    });

    // We no longer eagerly validate on row creation to avoid 
    // false-positive red borders when adding empty rows.
  }

  function validateRowFields(row, forceHighlight = false) {
    if (
      row.dataset.status === "success" ||
      row.dataset.status === "partial" ||
      row.dataset.status === "error"
    ) {
      return;
    }

    const clientSelect = $(".input-client", row);
    const deptSelect = $(".input-dept", row);
    const summaryInput = $(".input-summary", row);
    [clientSelect, deptSelect, summaryInput].forEach(el => {
      if (!el) return;
      const isEmpty = !el.value || el.value.trim() === "";
      
      if (isEmpty && forceHighlight) {
        el.style.border = "1px solid var(--danger-color, #ff3b30)";
      } else if (!isEmpty) {
        el.style.border = "";
      }
    });
  }

  function updateCategoryOptions(
    row,
    { selectedCategoryName = undefined } = {},
  ) {
    const departmentSelect = $(".input-dept", row);
    const categorySelect = $(".input-cat", row);

    if (!departmentSelect || !categorySelect) {
      return;
    }

    const currentValue =
      selectedCategoryName !== undefined
        ? selectedCategoryName
        : categorySelect.value;

    const filtered = filterCategoriesByDepartment(
      catalog.fullCategories,
      departmentSelect.value,
      catalog.fullDepartments,
    );

    categorySelect.innerHTML = createOptionsMarkup(
      filtered,
      {
        selectedValue: currentValue,
        placeholder: getCategoryPlaceholder(
          departmentSelect.value,
          filtered.length,
        ),
      },
    );
  }

  function serializeRow(row) {
    return {
      clientName: $(".input-client", row)?.value || "",
      departmentId: $(".input-dept", row)?.value || "",
      categoryName: $(".input-cat", row)?.value || "",
      attendantId: $(".input-attendant", row)?.value || "",
      subject: $(".input-summary", row)?.value || "",
      message: $(".input-message", row)?.value || "",
      selected: Boolean($(".row-select", row)?.checked),
      status: row.dataset.status || "",
    };
  }

  let saveDebounceTimer = null;
  function debouncedSaveQueueState(delay = 300) {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
    saveDebounceTimer = setTimeout(() => {
      saveCurrentQueueState();
      saveDebounceTimer = null;
    }, delay);
  }

  function setQueueControlsDisabled(disabled) {
    if (elements.addRowButton) elements.addRowButton.disabled = disabled;
    if (elements.importSpreadsheetButton) elements.importSpreadsheetButton.disabled = disabled;
    if (elements.retryFailedButton) elements.retryFailedButton.disabled = disabled;
    if (elements.removeSelectedButton) elements.removeSelectedButton.disabled = disabled;
    if (elements.selectAllCheckbox) elements.selectAllCheckbox.disabled = disabled;
    if (elements.generateAiButton) elements.generateAiButton.disabled = disabled;
    if (elements.startBotButton) elements.startBotButton.disabled = disabled;
    $$(".row-select", elements.tableBody).forEach((cb) => { cb.disabled = disabled; });
  }

  function saveCurrentQueueState() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    const rows = $$("tr", elements.tableBody).map(serializeRow);
    saveQueueState(rows, storage);
  }

  function restoreQueueState() {
    const savedRows = loadQueueState(storage);
    elements.tableBody.innerHTML = "";
    rowCount = 0;

    if (Array.isArray(savedRows) && savedRows.length > 0) {
      savedRows.forEach((rowData) => addRow(normalizeSavedRow(rowData)));
    } else {
      addRow();
    }
    updateRetryFailedButton();
  }

  function normalizeSavedRow(rowData) {
    return {
      clientName: rowData.clientName || "",
      departmentId: rowData.departmentId || rowData.deptId || "",
      categoryName: rowData.categoryName || rowData.catName || "",
      attendantId: rowData.attendantId || "",
      subject: rowData.subject || "",
      message: rowData.message || "",
      selected: Boolean(rowData.selected),
      status: rowData.status || "",
    };
  }

  function refreshExistingRows() {
    $$("tr", elements.tableBody).forEach((row) => {
      const serialized = serializeRow(row);
      const customerSelect = $(".input-client", row);
      const departmentSelect = $(".input-dept", row);
      const operatorSelect = $(".input-attendant", row);

      if (customerSelect) {
        customerSelect.innerHTML = createOptionsMarkup(catalog.customers, {
          selectedValue: serialized.clientName,
          placeholder: getCustomerPlaceholder(),
        });
      }

      if (departmentSelect) {
        departmentSelect.innerHTML = createOptionsMarkup(catalog.fullDepartments, {
          selectedValue: serialized.departmentId,
          placeholder: getDeptPlaceholder(),
          getValue: (department) => department.id,
          getLabel: (department) => department.name,
        });
      }

      updateCategoryOptions(row, {
        selectedCategoryName: serialized.categoryName,
      });

      if (operatorSelect) {
        operatorSelect.innerHTML = createOptionsMarkup(catalog.operators, {
          selectedValue: serialized.attendantId,
          placeholder: getOperatorPlaceholder(),
          getValue: (operator) => operator.id,
          getLabel: (operator) => operator.name,
        });
      }
    });

    saveCurrentQueueState();
  }

  function getRowsToProcess() {
    const rows = $$("tr", elements.tableBody);
    const anySelected = rows.some((row) => $(".row-select", row)?.checked);

    return anySelected
      ? rows.filter((row) => $(".row-select", row)?.checked)
      : rows;
  }

  function serializeRowsForActions(rows) {
    return rows.map((row) => ({
      id: row.dataset.id,
      clientName: $(".input-client", row)?.value || "",
      departmentId: $(".input-dept", row)?.value || "",
      departmentName:
        $(".input-dept", row)?.selectedOptions?.[0]?.textContent?.trim() || "",
      categoryName: $(".input-cat", row)?.value || "",
      subject: $(".input-summary", row)?.value || "",
      message: $(".input-message", row)?.value || "",
      attendantId: $(".input-attendant", row)?.value || "",
      attendantName:
        $(".input-attendant", row)?.selectedOptions?.[0]?.textContent?.trim() ||
        "",
    }));
  }

  async function handleCreateTickets() {
    const rowsToProcess = getRowsToProcess();

    if (rowsToProcess.length === 0) {
      log("Nenhuma linha para processar.");
      return;
    }

    const executionSettings = collectExecutionSettings(documentRef);
    const rowsPayload = serializeRowsForActions(rowsToProcess);

    const hasIncomplete = rowsPayload.some((row) => hasIncompleteQueueData(row).length > 0);
    if (hasIncomplete) {
      rowsToProcess.forEach(row => validateRowFields(row, true));
      toast.warning(
        "Por favor, preencha Cliente, Departamento e Resumo para todas as linhas."
      );
      return;
    }

    const confirmed = await showConfirmDialog({
      title: "Iniciar Criação em Lote",
      message: `Deseja criar ${rowsPayload.length} chamado${rowsPayload.length > 1 ? "s" : ""}?`,
      confirmText: "Criar Chamados",
      cancelText: "Cancelar",
    });
    if (!confirmed) {
      return;
    }

    log(
      executionSettings.token
        ? `Iniciando criacao via API (${rowsPayload.length} chamados)...`
        : "Token nao encontrado. Usando modo Navegador (Bot)..."
    );

    const startButton = documentRef.getElementById("btn-start-bot");
    const cancelButton = documentRef.getElementById("btn-cancel-bot");
    
    if (cancelButton) {
      cancelButton.classList.remove("hidden");
      cancelButton.onclick = () => {
        electronAPI.tickets.cancel();
        cancelButton.innerHTML = `<span class="spinner"></span> Cancelando...`;
        cancelButton.disabled = true;
      };
    }
    
    const progressHandler = (data) => {
      if (data.action === "create" && startButton) {
        startButton.innerHTML = `<span class="spinner"></span> Criando (${data.current}/${data.total})...`;
      }
    };
    
    const ipcHandler = electronAPI.tickets.onProgress(progressHandler);

    const restoreButton = setButtonBusy(
      startButton,
      '<span class="spinner"></span> Iniciando...',
    );
    setQueueControlsDisabled(true);

    try {
      const result = await electronAPI.tickets.create(rowsPayload, {
        settings: executionSettings,
        catalog: {
          fullCustomers: catalog.fullCustomers,
          fullCategories: catalog.fullCategories,
        },
      });

      log(`Resultado processamento: ${result.message}`, getResultTone(result.status));

      if (
        result.status === RESULT_STATUS.FATAL_ERROR ||
        result.status === RESULT_STATUS.RETRYABLE_ERROR
      ) {
        toast.error(result.message);
      }

      const details = Array.isArray(result.details)
        ? result.details
        : result.data?.details || [];

      if (!Array.isArray(details) || details.length === 0) {
        return;
      }

      details.forEach((item) => {
        const row = findRowById(documentRef, item.id);
        if (!row) {
          return;
        }

        if (item.status === RESULT_STATUS.SUCCESS || item.status === "Success") {
          markRowAsSuccess(row);
        } else if (isPartialStatus(item.status)) {
          markRowAsPartial(row, item.message || "Erro parcial");
        } else {
          markRowAsError(row, item.message || "Falha na criação");
        }
      });
    } finally {
      electronAPI.tickets.removeProgressListener(ipcHandler);
      restoreButton();
      setQueueControlsDisabled(false);
      if (cancelButton) {
        cancelButton.classList.add("hidden");
        cancelButton.disabled = false;
        cancelButton.innerHTML = "⏹ Cancelar";
        cancelButton.onclick = null;
      }
      // BUG-C: saveCurrentQueueState must run even if an error is thrown,
      // to persist any row statuses that were already marked before the failure.
      saveCurrentQueueState();
      updateRetryFailedButton();
    }
  }

  async function handleGenerateAi() {
    const rows = $$("tr", elements.tableBody);
    const anySelected = rows.some((row) => $(".row-select", row)?.checked);

    const rowsToProcess = anySelected
      ? rows.filter((row) => $(".row-select", row)?.checked)
      : rows.filter((row) =>
          isPendingGeneratedMessage($(".input-message", row)?.value || ""),
        );

    if (!anySelected && rowsToProcess.length === 0 && rows.length > 0) {
      log(
        "Todas as mensagens ja foram geradas. Selecione a caixa da linha caso deseje reescrever uma especifica.",
      );
      toast.info(
        "Todas as mensagens já estão geradas. Marque a caixinha do chamado que deseja refazer.",
      );
      return;
    }

    if (rowsToProcess.length === 0) {
      log("Nenhuma linha para processar.");
      return;
    }

    const hasIncomplete = rowsToProcess.some(row => {
      const summary = $(".input-summary", row)?.value || "";
      const client = $(".input-client", row)?.value || "";
      return !summary.trim() || !client.trim();
    });

    if (hasIncomplete) {
      rowsToProcess.forEach(row => validateRowFields(row, true));
      toast.warning(
        "Por favor, preencha Cliente e Resumo nas linhas selecionadas para a IA."
      );
      return;
    }

    const confirmedAi = await showConfirmDialog({
      title: "Gerar Mensagens com IA",
      message: `Deseja gerar mensagens para ${rowsToProcess.length} chamado${rowsToProcess.length > 1 ? "s" : ""}?`,
      confirmText: "Gerar com IA",
      cancelText: "Cancelar",
    });
    if (!confirmedAi) {
      return;
    }

    log(`Processando ${rowsToProcess.length} linhas com IA...`);

    const restoreBtn = setButtonBusy(
      elements.generateAiButton,
      '<span class="spinner"></span> Iniciando...'
    );
    setQueueControlsDisabled(true);

    const aiSettings = collectAiSettings(documentRef);
    const executionSettings = collectExecutionSettings(documentRef);
    const waitTime = computeWaitTime({
      turbo: executionSettings.turboMode,
      delaySeconds: executionSettings.delay,
    });

    if (!executionSettings.turboMode) {
      log(
        "Nota: para reduzir risco de bloqueio (429), sera aplicada pausa entre requisicoes.",
      );
    }

    let aiCancelRequested = false;
    const cancelButton = documentRef.getElementById("btn-cancel-bot");
    
    if (cancelButton) {
      cancelButton.classList.remove("hidden");
      cancelButton.onclick = () => {
        aiCancelRequested = true;
        cancelButton.innerHTML = `<span class="spinner"></span> Cancelando...`;
        cancelButton.disabled = true;
      };
    }

    try {
      for (let index = 0; index < rowsToProcess.length; index += 1) {
        if (aiCancelRequested) {
          log("Geração de IA cancelada pelo usuário.");
          break;
        }
        elements.generateAiButton.innerHTML = `<span class="spinner"></span> Gerando IA (${index + 1}/${rowsToProcess.length})...`;
        
        const row = rowsToProcess[index];
        const summary = $(".input-summary", row)?.value || "";
        const messageInput = $(".input-message", row);

        if (!summary || !messageInput) {
          continue;
        }

        messageInput.value = "Gerando...";
        messageInput.readOnly = true;

        try {
          const clientName = $(".input-client", row)?.value || "Cliente";

          if (aiSettings.debugMode) {
            log(
              `[DEBUG] Enviando para IA: Model=${aiSettings.model}, Client=${clientName}, PromptCustomizado=${aiSettings.customPrompt ? "Sim" : "Nao"}`,
            );
          }

          const aiResponse = await electronAPI.ai.generateTicket({
            summary,
            clientName,
            settings: aiSettings,
          });

          if (!aiResponse.success) {
            throw new Error(aiResponse.message || "Falha ao gerar texto com IA.");
          }

          if (aiSettings.debugMode) {
            log(`[DEBUG] Resposta Bruta: ${aiResponse.data}`);
          }

          const parsed = parseJsonSafely(aiResponse.data);
          messageInput.value = parsed?.descricao || aiResponse.data;
          messageInput.readOnly = false;
          saveCurrentQueueState();

          log(`IA gerou texto para linha ${row.dataset.id}`);
        } catch (error) {
          const errorText = String(error?.message || error);
          messageInput.readOnly = false;

          if (
            errorText.includes("429") ||
            errorText.includes("Too Many Requests") ||
            errorText.includes("Quota exceeded")
          ) {
            messageInput.value = "Falha (Limite)";
            log(`Limite de IA atingido na linha ${row.dataset.id}: ${error.message}`, "error");
            toast.warning("Limite de requisições da IA atingido. Aguarde alguns minutos ou reduza o ritmo.");
            break; // Interrompe o lote para não consumir tempo inútil se a cota acabou
          } else {
            messageInput.value = "Erro na IA";
            log(`Erro na IA linha ${row.dataset.id}: ${error.message}`, "error");
          }
        }

        if (index < rowsToProcess.length - 1 && !aiCancelRequested) {
          await sleep(waitTime);
        }
      }

      log("Processamento de IA finalizado.");
    } finally {
      // BUG-D: Ensure all readOnly fields are restored even on cancel/error
      rowsToProcess.forEach(row => {
        const messageInput = $(".input-message", row);
        if (messageInput && messageInput.readOnly) {
          messageInput.readOnly = false;
        }
      });
      restoreBtn();
      setQueueControlsDisabled(false);
      if (cancelButton) {
        cancelButton.classList.add("hidden");
        cancelButton.disabled = false;
        cancelButton.innerHTML = "⏹ Cancelar";
        cancelButton.onclick = null;
      }
    }
  }

  function markRowAsSuccess(row) {
    row.dataset.status = "success";
    row.classList.add("row-status-success");
    row.classList.remove("row-status-error", "row-status-partial");
    row.removeAttribute("title");
    $$("input, select, textarea", row).forEach((element) => {
      if (!element.classList.contains("row-select")) {
        element.disabled = true;
      }
    });
    updateRetryFailedButton();
  }

  function markRowAsError(row, message = "") {
    row.dataset.status = "error";
    row.classList.add("row-status-error");
    row.classList.remove("row-status-success", "row-status-partial");
    if (message) row.title = message;
    updateRetryFailedButton();
  }

  function markRowAsPartial(row, message = "") {
    row.dataset.status = "partial";
    row.classList.add("row-status-partial");
    row.classList.remove("row-status-success", "row-status-error");
    if (message) row.title = message;
    updateRetryFailedButton();
  }

  function updateRetryFailedButton() {
    if (!elements.retryFailedButton) return;
    const failedRows = $$("tr", elements.tableBody).filter(
      (r) => r.dataset.status === "error" || r.dataset.status === "partial",
    );
    if (failedRows.length > 0) {
      elements.retryFailedButton.classList.remove("hidden");
      elements.retryFailedButton.textContent = `🔄 Reprocessar Falhas (${failedRows.length})`;
    } else {
      elements.retryFailedButton.classList.add("hidden");
    }
  }

  async function handleRetryFailedRows() {
    const allRows = $$("tr", elements.tableBody);
    const failedRows = allRows.filter(
      (r) => r.dataset.status === "error" || r.dataset.status === "partial",
    );
    if (failedRows.length === 0) {
      toast.info("Nenhum chamado com falha para reprocessar.");
      return;
    }

    allRows.forEach((row) => {
      const cb = $(".row-select", row);
      if (row.dataset.status === "error" || row.dataset.status === "partial") {
        if (cb) cb.checked = true;
        delete row.dataset.status;
        row.classList.remove("row-status-error", "row-status-partial");
        row.removeAttribute("title");
        $$("input, select, textarea", row).forEach((el) => {
          el.disabled = false;
        });
      } else {
        if (cb) cb.checked = false;
      }
    });

    toggleRemoveButton();
    updateRetryFailedButton();
    saveCurrentQueueState();

    toast.info(`Selecionadas ${failedRows.length} linhas com falha para reprocessamento.`);
    await handleCreateTickets();
  }

  let pendingImportResult = null;

  function openImportModal(initialText = "") {
    if (!elements.importModal) return;
    elements.importModal.classList.remove("hidden");
    if (elements.importTextarea) {
      elements.importTextarea.value = initialText;
      updateImportPreview();
      setTimeout(() => elements.importTextarea.focus(), 50);
    }
  }

  function closeImportModal() {
    if (!elements.importModal) return;
    elements.importModal.classList.add("hidden");
    if (elements.importTextarea) elements.importTextarea.value = "";
    if (elements.importBadge) elements.importBadge.classList.add("hidden");
    if (elements.importFeedback) {
      elements.importFeedback.classList.add("hidden");
      elements.importFeedback.innerHTML = "";
    }
    if (elements.confirmImportButton) elements.confirmImportButton.disabled = true;
    pendingImportResult = null;
  }

  function updateImportPreview() {
    const text = elements.importTextarea?.value || "";
    pendingImportResult = parseSpreadsheetText(text, catalog);
    const count = pendingImportResult.totalParsed;
    if (count > 0) {
      if (elements.confirmImportButton) elements.confirmImportButton.disabled = false;
      if (elements.importBadge) {
        elements.importBadge.classList.remove("hidden");
        elements.importBadge.textContent = `${count} chamado${count > 1 ? "s" : ""} detectado${count > 1 ? "s" : ""}`;
        elements.importBadge.classList.toggle(
          "has-warnings",
          pendingImportResult.warnings.length > 0,
        );
      }
      if (elements.importFeedback) {
        if (pendingImportResult.warnings.length > 0) {
          elements.importFeedback.classList.remove("hidden");
          elements.importFeedback.innerHTML = `<strong>Avisos (${pendingImportResult.warnings.length}):</strong><br>${pendingImportResult.warnings.slice(0, 5).join("<br>")}${pendingImportResult.warnings.length > 5 ? "<br>..." : ""}`;
        } else {
          elements.importFeedback.classList.add("hidden");
          elements.importFeedback.innerHTML = "";
        }
      }
    } else {
      if (elements.confirmImportButton) elements.confirmImportButton.disabled = true;
      if (elements.importBadge) elements.importBadge.classList.add("hidden");
      if (elements.importFeedback) {
        elements.importFeedback.classList.add("hidden");
        elements.importFeedback.innerHTML = "";
      }
    }
  }

  async function handleReadClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        if (elements.importTextarea) {
          elements.importTextarea.value = text;
          updateImportPreview();
        }
      } else {
        toast.info("A área de transferência não contém texto.");
      }
    } catch (err) {
      toast.warning("Não foi possível acessar a área de transferência. Use Ctrl+V dentro da caixa.");
    }
  }

  function handleConfirmImport() {
    if (!pendingImportResult || pendingImportResult.rows.length === 0) return;

    const existingRows = $$("tr", elements.tableBody);
    if (
      existingRows.length === 1 &&
      !$(".input-client", existingRows[0])?.value &&
      !$(".input-summary", existingRows[0])?.value
    ) {
      elements.tableBody.innerHTML = "";
    }

    let count = 0;
    pendingImportResult.rows.forEach((rowData) => {
      const row = addRow(rowData);
      if (row && rowData.hasWarnings) {
        validateRowFields(row, true);
      }
      count++;
    });

    saveCurrentQueueState();
    toggleRemoveButton();
    toggleQueueEmptyState();
    updateRetryFailedButton();
    closeImportModal();

    toast.success(`${count} chamado${count > 1 ? "s" : ""} importado${count > 1 ? "s" : ""} da planilha com sucesso!`);
  }

  function handleGlobalKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      const queueTab = documentRef.getElementById("queue");
      if (queueTab && queueTab.classList.contains("active")) {
        e.preventDefault();
        addRow();
        toast.info("Nova linha adicionada (Ctrl+N)");
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const queueTab = documentRef.getElementById("queue");
      if (queueTab && queueTab.classList.contains("active")) {
        e.preventDefault();
        if (elements.startBotButton && !elements.startBotButton.disabled) {
          handleCreateTickets();
        }
      }
    } else if (e.key === "Escape") {
      if (elements.importModal && !elements.importModal.classList.contains("hidden")) {
        closeImportModal();
      }
    }
  }

  return {
    init,
    getCatalog,
    replaceCatalog,
    refreshExistingRows,
    updateRetryFailedButton,
    handleRetryFailedRows,
  };
}
