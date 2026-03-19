import { $, $$, sleep } from "./common.mjs";
import {
  computeWaitTime,
  escapeHtml,
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
      elements.emptyState.style.display = "none";
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

    elements.operatorFilter.style.display = "inline-block";
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
        '<tr><td colspan="6" style="text-align:center;">Nenhum chamado encontrado.</td></tr>';
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
        window.alert(
          "Todas as solucoes ja estao geradas. Marque a caixinha do chamado que deseja refazer.",
        );
        return;
      }
    }

    if (selectedRows.length === 0) {
      return;
    }

    log(`Gerando solucao para ${selectedRows.length} chamados...`);

    const aiSettings = collectAiSettings(documentRef);
    const executionSettings = collectExecutionSettings(documentRef);
    const waitTime = computeWaitTime({
      turbo: executionSettings.turboMode,
      delaySeconds: executionSettings.delay,
    });

    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index];
      const solutionInput = $(".input-solution", row);
      if (!solutionInput) {
        continue;
      }

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
  }

  async function handleCloseSelected() {
    const selectedRows = getSelectedRows();

    if (selectedRows.length === 0) {
      window.alert("Selecione pelo menos um chamado para fechar.");
      return;
    }

    const ticketsToClose = selectedRows.map((row) => ({
      id: row.dataset.id,
      solution: $(".input-solution", row)?.value.trim() || "",
    }));

    if (ticketsToClose.some((ticket) => isPendingSolution(ticket.solution))) {
      const confirmed = window.confirm(
        "Alguns chamados estao sem solucao definida. Deseja continuar mesmo assim?",
      );
      if (!confirmed) {
        return;
      }
    }

    log(`Iniciando fechamento de ${ticketsToClose.length} chamados...`);

    const executionSettings = collectExecutionSettings(documentRef);

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
        window.alert(result.message);
      }

      const details = Array.isArray(result.details)
        ? result.details
        : result.data?.details || [];

      if (!Array.isArray(details) || details.length === 0) {
        return;
      }

      details.forEach((item) => {
        const row = documentRef.querySelector(`tr[data-id="${item.id}"]`);
        if (!row) {
          return;
        }

        if (item.status === RESULT_STATUS.SUCCESS || item.status === "Success") {
          row.style.backgroundColor = "#d1e7dd";
          $$("input:not([type='checkbox']), textarea", row).forEach((input) => {
            input.disabled = true;
            input.style.color = "#000000";
            input.style.fontWeight = "bold";
          });
        } else if (isPartialStatus(item.status)) {
          row.style.backgroundColor = "#fff3cd";
          row.style.color = "#664d03";
        } else {
          row.style.backgroundColor = "#f8d7da";
          row.style.color = "#721c24";
        }
      });

    } catch (error) {
      log(`Falha no fechamento: ${error.message}`, "error");
    }
  }

  return {
    init,
  };
}
