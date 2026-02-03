// DOM Elements
const tabs = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const btnAddRow = document.getElementById('btn-add-row');
const tableBody = document.getElementById('ticket-queue-body');
const btnGenerateAI = document.getElementById('btn-generate-ai');
const btnStartBot = document.getElementById('btn-start-bot');
const btnSaveSettings = document.getElementById('btn-save-settings');
const logsOutput = document.getElementById('logs-output');

// State
let rowCount = 0;

// Tab Switching Logic
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        document.getElementById(targetId).classList.add('active');
    });
});

// Helper: Log message
function log(msg) {
    const div = document.createElement('div');
    div.classList.add('log-entry');
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logsOutput.appendChild(div);
    logsOutput.scrollTop = logsOutput.scrollHeight;
}

// Grid: Add Row
function addRow() {
    rowCount++;
    const tr = document.createElement('tr');
    tr.dataset.id = rowCount;

    tr.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td><input type="text" placeholder="Nome do Cliente" class="input-client"></td>
        <td>
            <select class="input-dept input-field" style="padding:5px;">
                <option value="Suporte">Suporte</option>
                <option value="Comercial">Comercial</option>
                <option value="Financeiro">Financeiro</option>
            </select>
        </td>
        <td><input type="text" placeholder="Ex: Internet lenta" class="input-summary"></td>
        <td><input type="text" placeholder="Aguardando IA..." class="input-message" disabled></td>
        <td>
            <label style="font-size:0.8rem; display:flex; align-items:center; gap:5px;">
                <input type="checkbox" class="input-resolve"> Resolver?
            </label>
        </td>
        <td><span class="status-badge" style="color: #6c7086;">Pendente</span></td>
        <td><button class="btn danger" style="padding:2px 8px; font-size:0.8rem;" onclick="removeRow(this)">X</button></td>
    `;

    tableBody.appendChild(tr);
}

// Grid: Remove Row
window.removeRow = function (btn) {
    const tr = btn.closest('tr');
    tr.remove();
}

btnAddRow.addEventListener('click', addRow);

// Add initial row
addRow();

// Generate AI Logic
btnGenerateAI.addEventListener('click', async () => {
    log('Solicitando geração de texto para linhas selecionadas...');
    const rows = document.querySelectorAll('#ticket-queue-body tr');

    for (const tr of rows) {
        const checkbox = tr.querySelector('.row-select');
        if (checkbox.checked || rows.length === 1) { // If checked or only one row
            const summary = tr.querySelector('.input-summary').value;
            const messageInput = tr.querySelector('.input-message');

            if (summary) {
                messageInput.value = "Gerando...";
                try {
                    // Call Electron API (Main Process)
                    const aiText = await window.electronAPI.generateAI(summary);
                    messageInput.value = aiText;
                    log(`IA gerou texto para linha ${tr.dataset.id}`);
                } catch (error) {
                    messageInput.value = "Erro na IA";
                    console.warn(error);
                }
            }
        }
    }
});

// Start Bot Logic
btnStartBot.addEventListener('click', async () => {
    log('Iniciando processamento do Bot...');
    const dataToProcess = [];

    const rows = document.querySelectorAll('#ticket-queue-body tr');
    rows.forEach(tr => {
        const client = tr.querySelector('.input-client').value;
        const dept = tr.querySelector('.input-dept').value;
        const summary = tr.querySelector('.input-summary').value;
        const message = tr.querySelector('.input-message').value;
        const resolve = tr.querySelector('.input-resolve').checked;

        if (client && summary) {
            dataToProcess.push({
                id: tr.dataset.id,
                client, dept, summary, message, resolve
            });
        }
    });

    if (dataToProcess.length === 0) {
        alert('Preencha pelo menos uma linha completa (Cliente e Resumo).');
        return;
    }

    log(`Enviando ${dataToProcess.length} tickets para o bot.`);

    // Call Electron API
    const result = await window.electronAPI.startBot(dataToProcess);
    log(`Resultado: ${result.message}`);
});

// Settings Save
btnSaveSettings.addEventListener('click', () => {
    const email = document.getElementById('settings-email').value;
    alert(`Credenciais salvas localmente para: ${email}`);
    log('Configurações atualizadas.');
});
