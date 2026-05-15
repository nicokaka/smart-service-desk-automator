import { $, $$, sleep, setButtonBusy } from "./common.mjs";
import {
  computeWaitTime,
  escapeHtml,
  findRowById,
  getResultTone,
  isPartialStatus,
  isPendingSolution,
  parseJsonSafely,
  RESULT_STATUS,
} from "./domain.mjs";
import {
  collectAiSettings,
  collectExecutionSettings,
} from "./runtime-settings.mjs";
import { toast } from "./toast.mjs";
import { showConfirmDialog } from "./confirm-modal.mjs";

export function createManagerController({
  electronAPI,
  log,
  documentRef = document,
}) {
  const elements = {
    loadTicketsButton: documentRef.getElementById("btnLoadApiTickets"),
    apiStatus: documentRef.getElementById("apiStatus"),
    operatorFilter: documentRef.getElementById("operatorFilter"),
    tableBody: documentRef.getElementById("manager-queue-body"),
    tableContainer: documentRef.getElementById("manager-table-container"),
    emptyState: documentRef.getElementById("manager-empty-state"),
    selectAllCheckbox: documentRef.getElementById("select-all-manager"),
    generateSolutionButton: documentRef.getElementById("btnGenerateSolutionAI"),
    closeSelectedButton: documentRef.getElementById("btnCloseSelected"),
  };

  let allTickets = [];
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    elements.loadTicketsButton?.addEventListener("click", handleLoadTickets);
    elements.operatorFilter?.addEventListener("change", handleOperatorFilter);
    elements.selectAllCheckbox?.addEventListener("change", (event) => {
      $$(".manager-check", elements.tableBody).forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
    });
    elements.generateSolutionButton?.addEventListener(
      "click",
      handleGenerateSolutions,
    );
    elements.closeSelectedButton?.addEventListener("click", handleCloseSelected);
  }

  async function handleLoadTickets() {
    const executionSettings = collectExecutionSettings(documentRef);
    if (!executionSettings.token) {
      elements.apiStatus.innerText = "Token nao configurado nas Configuracoes.";
      return;
    }

    elements.loadTicketsButton.disabled = true;
    elements.loadTicketsButton.innerText = "Carregando...";
    elements.apiStatus.innerText = "Buscando chamados...";
    if (elements.emptyState) {
      elements.emptyState.classList.add("hidden");
    }

    try {
      const response = await electronAPI.tickets.list(executionSettings);

      if (
        response.status === RESULT_STATUS.FATAL_ERROR ||
        response.status === RESULT_STATUS.RETRYABLE_ERROR
      ) {
        throw new Error(response.message || "Falha ao buscar chamados.");
      }

      allTickets = Array.isArray(response.data) ? response.data : [];
      elements.apiStatus.innerText = isPartialStatus(response.status)
        ? `${allTickets.length} chamados (parcial).`
        : `${allTickets.length} chamados.`;
      elements.tableContainer?.classList.remove("hidden");
      populateOperatorFilter(allTickets);
      renderTickets(allTickets);
      if (isPartialStatus(response.status)) {
        log(response.message, getResultTone(response.status));
      }
    } catch (error) {
      elements.apiStatus.innerText = `Erro: ${error.message}`;
      log(`Falha ao buscar chamados: ${error.message}`, "error");
    } finally {
      elements.loadTicketsButton.disabled = false;
      elements.loadTicketsButton.innerText = "Buscar Meus Chamados";
    }
  }

  function populateOperatorFilter(tickets) {
    if (!elements.operatorFilter) {
      return;
    }

    const operators = new Map();
    tickets.forEach((ticket) => {
      if (ticket.operator?.id) {
        operators.set(ticket.operator.id, ticket.operator.name);
      }
    });

    elements.operatorFilter.classList.remove("hidden");
    elements.operatorFilter.innerHTML =
      '<option value="">Todos os Atendentes</option>';

    operators.forEach((name, id) => {
      const option = documentRef.createElement("option");
      option.value = id;
      option.innerText = name;
      elements.operatorFilter.appendChild(option);
    });
  }

  function handleOperatorFilter() {
    const selectedId = elements.operatorFilter?.value || "";
    if (!selectedId) {
      renderTickets(allTickets);
      return;
    }

    renderTickets(
      allTickets.filter(
        (ticket) => String(ticket.operator?.id ?? "") === String(selectedId),
      ),
    );
  }

  function renderTickets(tickets) {
    elements.tableBody.innerHTML = "";

    if (!Array.isArray(tickets) || tickets.length === 0) {
      elements.tableBody.innerHTML =
        '<tr><td colspan="6" class="text-muted text-center">Nenhum chamado encontrado.</td></tr>';
      return;
    }

    tickets.forEach((ticket) => {
      const row = documentRef.createElement("tr");
      row.dataset.id = ticket.id;
      row.dataset.title = ticket.subject || "";
      row.dataset.description = ticket.description || ticket.subject || "";
      row.dataset.client = ticket.customer?.name || "Cliente";

      const protocol = escapeHtml(ticket.protocol || ticket.id || "");
      const subject = escapeHtml(ticket.subject || "Sem Assunto");
      const client = escapeHtml(ticket.customer?.name || "Desconhecido");
      const attendant = escapeHtml(ticket.operator?.name || "Sem Atendente");

      row.innerHTML = `
        <td><input type="checkbox" class="manager-check"></td>
        <td>${protocol}</td>
        <td>${subject}</td>
        <td>${client}</td>
        <td>${attendant}</td>
        <td><textarea class="input-solution" rows="3" placeholder="Mensagem de encerramento..."></textarea></td>
      `;

      elements.tableBody.appendChild(row);
    });
  }

  function getSelectedRows() {
    return $$("tr", elements.tableBody).filter(
      (row) => $(".manager-check", row)?.checked,
    );
  }

  async function handleGenerateSolutions() {
    const rows = $$("tr", elements.tableBody);
    let selectedRows = getSelectedRows();

    if (selectedRows.length === 0 && rows.length > 0) {
      selectedRows = rows.filter((row) =>
        isPendingSolution($(".input-solution", row)?.value || ""),
      );

      if (selectedRows.length === 0) {
        log(
          "Todas as solucoes ja foram geradas. Marque a linha para reescrever uma especifica.",
        );
        toast.info(
          "Todas as soluções já estão geradas. Marque a caixinha do chamado que deseja refazer."
        );
        return;
      }
    }

    if (selectedRows.length === 0) {
      return;
    }

    log(`Gerando solucao para ${selectedRows.length} chamados...`);

    const restoreBtn = setButtonBusy(
      elements.generateSolutionButton, 
      '<span class="spinner"></span> Iniciando...'
    );

    const aiSettings = collectAiSettings(documentRef);
    const executionSettings = collectExecutionSettings(documentRef);
    const waitTime = computeWaitTime({
      turbo: executionSettings.turboMode,
      delaySeconds: executionSettings.delay,
    });

    let solutionCancelRequested = false;
    const cancelButton = documentRef.getElementById("btnCancelManager");

    if (cancelButton) {
      cancelButton.classList.remove("hidden");
      cancelButton.onclick = () => {
        solutionCancelRequested = true;
        cancelButton.innerHTML = `<span class="spinner"></span> Cancelando...`;
        cancelButton.disabled = true;
      };
    }

    try {
      for (let index = 0; index < selectedRows.length; index += 1) {
        if (solutionCancelRequested) {
          log("Geração de soluções cancelada pelo usuário.");
          break;
        }

        const row = selectedRows[index];
        const solutionInput = $(".input-solution", row);
        if (!solutionInput) {
          continue;
        }

        elements.generateSolutionButton.innerHTML = `<span class="spinner"></span> Gerando IA (${index + 1}/${selectedRows.length})...`;
        solutionInput.value = "Gerando...";

        try {
          const aiResponse = await electronAPI.ai.generateSolution({
            title: row.dataset.title || "",
            description: row.dataset.description || "",
            clientName: row.dataset.client || "Cliente",
            settings: aiSettings,
          });

          if (!aiResponse.success) {
            throw new Error(aiResponse.message || "Falha ao gerar solucao.");
          }

          const parsed = parseJsonSafely(aiResponse.data);
          solutionInput.value = parsed?.solucao || aiResponse.data;
        } catch (error) {
          solutionInput.value = "Erro na IA.";
          log(`Erro ao gerar solucao: ${error.message}`, "error");
        }

        if (index < selectedRows.length - 1) {
          await sleep(waitTime);
        }
      }

      log("Geração de soluções finalizada.");
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

  async function handleCloseSelected() {
    const selectedRows = getSelectedRows();

    if (selectedRows.length === 0) {
      toast.warning("Selecione pelo menos um chamado para fechar.");
      return;
    }

    const ticketsToClose = selectedRows.map((row) => ({
      id: row.dataset.id,
      solution: $(".input-solution", row)?.value.trim() || "",
    }));

    if (ticketsToClose.some((ticket) => isPendingSolution(ticket.solution))) {
      const confirmed = await showConfirmDialog({
        title: "Atenção",
        message: "Alguns chamados estão sem solução definida. Deseja continuar mesmo assim?",
        confirmText: "Sim, continuar",
        cancelText: "Cancelar",
        confirmClass: "danger"
      });
      if (!confirmed) {
        return;
      }
    }

    const confirmedClose = await showConfirmDialog({
      title: "Fechar Chamados Selecionados",
      message: `Deseja iniciar o fechamento de ${ticketsToClose.length} chamado${ticketsToClose.length > 1 ? "s" : ""}?`,
      confirmText: "Fechar Chamados",
      cancelText: "Cancelar",
      confirmClass: "danger",
    });
    if (!confirmedClose) {
      return;
    }

    log(`Iniciando fechamento de ${ticketsToClose.length} chamados...`);

    const executionSettings = collectExecutionSettings(documentRef);
    
    const closeBtn = documentRef.getElementById("btnCloseSelected");
    const progressHandler = (data) => {
      if (data.action === "close" && closeBtn) {
        closeBtn.innerHTML = `<span class="spinner"></span> Fechando (${data.current}/${data.total})...`;
      }
    };
    const ipcHandler = electronAPI.tickets.onProgress(progressHandler);

    const restoreBtn = setButtonBusy(
      closeBtn,
      '<span class="spinner"></span> Iniciando...'
    );

    const cancelButton = documentRef.getElementById("btnCancelManager");
    if (cancelButton) {
      cancelButton.classList.remove("hidden");
      cancelButton.onclick = () => {
        electronAPI.tickets.cancel();
        cancelButton.innerHTML = `<span class="spinner"></span> Cancelando...`;
        cancelButton.disabled = true;
      };
    }

    try {
      const result = await electronAPI.tickets.close(
        ticketsToClose,
        executionSettings,
      );
      log(`Resultado Fechamento: ${result.message}`, getResultTone(result.status));

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
          row.classList.add("row-status-success");
          row.classList.remove("row-status-error", "row-status-partial");
          row.removeAttribute("title");
          $$("input:not([type='checkbox']), textarea", row).forEach((input) => {
            input.disabled = true;
          });
        } else if (isPartialStatus(item.status)) {
          row.classList.add("row-status-partial");
          row.classList.remove("row-status-success", "row-status-error");
          row.title = item.message || "Erro parcial";
        } else {
          row.classList.add("row-status-error");
          row.classList.remove("row-status-success", "row-status-partial");
          row.title = item.message || "Erro no fechamento";
        }
      });

    } catch (error) {
      log(`Falha no fechamento: ${error.message}`, "error");
    } finally {
      electronAPI.tickets.removeProgressListener(ipcHandler);
      restoreBtn();
      if (cancelButton) {
        cancelButton.classList.add("hidden");
        cancelButton.disabled = false;
        cancelButton.innerHTML = "⏹ Cancelar";
        cancelButton.onclick = null;
      }
    }
  }

  return {
    init,
  };
}
