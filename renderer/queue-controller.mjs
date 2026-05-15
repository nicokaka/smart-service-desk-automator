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
    });

    elements.addRowButton?.addEventListener("click", () => {
      addRow();
    });

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
    }

    renderClientDatalist();
    refreshExistingRows();
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
      getValue: (department) => department.id,
      getLabel: (department) => department.name,
    });

    const categoryOptions = createOptionsMarkup(
      filterCategoriesByDepartment(
        catalog.fullCategories,
        data.departmentId || "",
        catalog.fullDepartments,
      ),
      {
        selectedValue: data.categoryName,
      },
    );

    const customerOptions = createOptionsMarkup(catalog.customers, {
      selectedValue: data.clientName,
    });

    const operatorOptions = createOptionsMarkup(catalog.operators, {
      selectedValue: data.attendantId,
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
      saveCurrentQueueState();
    });

    updateCategoryOptions(row, {
      selectedCategoryName: data.categoryName || "",
    });

    $$("input, select, textarea", row).forEach((input) => {
      input.addEventListener("change", () => {
        validateRowFields(row);
        saveCurrentQueueState();
      });
      input.addEventListener("input", () => {
        validateRowFields(row);
        saveCurrentQueueState();
      });
    });

    // Only run initial validation for new rows (not on localStorage restore)
    // to avoid false-positive red borders before catalog loads.
    if (!data || (!data.clientName && !data.departmentId && !data.subject)) {
      return;
    }
    validateRowFields(row);
  }

  function validateRowFields(row) {
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
      if (!el.value || el.value.trim() === "") {
        el.style.border = "1px solid var(--danger-color, #ff3b30)";
        el.style.backgroundColor = "rgba(255, 59, 48, 0.05)";
      } else {
        el.style.border = "";
        el.style.backgroundColor = "";
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

    categorySelect.innerHTML = createOptionsMarkup(
      filterCategoriesByDepartment(
        catalog.fullCategories,
        departmentSelect.value,
        catalog.fullDepartments,
      ),
      {
        selectedValue: currentValue,
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

  function saveCurrentQueueState() {
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
        });
      }

      if (departmentSelect) {
        departmentSelect.innerHTML = createOptionsMarkup(catalog.fullDepartments, {
          selectedValue: serialized.departmentId,
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

    if (
      rowsPayload.some(
        (row) => hasIncompleteQueueData(row).length > 0,
      )
    ) {
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
      if (cancelButton) {
        cancelButton.classList.add("hidden");
        cancelButton.disabled = false;
        cancelButton.innerHTML = "⏹ Cancelar";
        cancelButton.onclick = null;
      }
    }
    
    saveCurrentQueueState();
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

        let attempt = 0;
        let completed = false;

        while (attempt < 3 && !completed) {
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
            completed = true;
            saveCurrentQueueState();

            log(`IA gerou texto para linha ${row.dataset.id}`);
          } catch (error) {
            const errorText = String(error);
            if (
              errorText.includes("429") ||
              errorText.includes("Too Many Requests") ||
              errorText.includes("Quota exceeded")
            ) {
              attempt += 1;
              const delayInSeconds = attempt === 1 ? 30 : attempt === 2 ? 60 : 120;
              messageInput.value = `Aguardando (429)... ${attempt}/3`;
              log(
                `Limite da API atingido (429). Aguardando ${delayInSeconds}s antes de tentar novamente (Tentativa ${attempt}/3)...`,
                "error",
              );
              await sleep(delayInSeconds * 1000);
            } else {
              messageInput.value = "Erro na IA";
              messageInput.readOnly = false;
              log(`Erro na IA linha ${row.dataset.id}: ${error.message}`, "error");
              break;
            }
          }
        }

        if (!completed && attempt >= 3) {
          messageInput.value = "Falha (Limite)";
          messageInput.readOnly = false;
          log(`Falha na linha ${row.dataset.id} apos 3 tentativas.`, "error");
        }

        if (index < rowsToProcess.length - 1) {
          await sleep(waitTime);
        }
      }

      log("Processamento de IA finalizado.");
    } finally {
      restoreBtn();
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
  }

  function markRowAsError(row, message = "") {
    row.dataset.status = "error";
    row.classList.add("row-status-error");
    row.classList.remove("row-status-success", "row-status-partial");
    if (message) row.title = message;
  }

  function markRowAsPartial(row, message = "") {
    row.dataset.status = "partial";
    row.classList.add("row-status-partial");
    row.classList.remove("row-status-success", "row-status-error");
    if (message) row.title = message;
  }

  return {
    init,
    getCatalog,
    replaceCatalog,
    refreshExistingRows,
  };
}
