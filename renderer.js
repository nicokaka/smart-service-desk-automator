// Elementos do DOM
const tabs = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const btnAddRow = document.getElementById('btn-add-row');
const tableBody = document.getElementById('ticket-queue-body');
const btnGenerateAI = document.getElementById('btn-generate-ai');
const btnStartBot = document.getElementById('btn-start-bot');
document.addEventListener('DOMContentLoaded', () => {
    // --- Load Saved Token ---
    const savedToken = localStorage.getItem('tomticketToken');
    if (savedToken) {
        document.getElementById('apiToken').value = savedToken;
        // Optional: Sync in background check
        if (!localStorage.getItem('cachedDepartments')) {
            syncData(); // Sync if no cache
        }
    }
});

const startBtn = document.getElementById('startMsgBtn');

const btnSaveSettings = document.getElementById('btn-save-settings');
const logsOutput = document.getElementById('logs-output');

// State
let rowCount = 0;

// Lógica de Troca de Abas
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

// Auxiliar: Mensagem de Log
function log(msg) {
    const div = document.createElement('div');
    div.classList.add('log-entry');
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logsOutput.appendChild(div);
    logsOutput.scrollTop = logsOutput.scrollHeight;
}

// Lista de Departamentos (Será sobrescrita pela API)
let DEPARTMENTS = [
    "Administrativo", "Comercial", "TI" // Minimal fallback
];

// Lista de Categorias (Será sobrescrita pela API)
let CATEGORIES = [
    "Outros" // Minimal fallback
];

// Grade: Adicionar Linha
function addRow() {
    rowCount++;
    const tr = document.createElement('tr');
    tr.dataset.id = rowCount;

    // Criar Opções de Departamento
    const deptOptions = DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    // Criar Opções de Categoria
    const catOptions = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

    tr.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td><input type="text" placeholder="Nome do Cliente" class="input-client" list="clients-list"></td>
        <td>
            <select class="input-dept input-field" style="padding:5px;">
                ${deptOptions}
            </select>
        </td>
        <td>
            <select class="input-cat input-field" style="padding:5px;">
                ${catOptions}
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

// Grade: Remover Linha
window.removeRow = function (btn) {
    const tr = btn.closest('tr');
    tr.remove();
}

btnAddRow.addEventListener('click', addRow);

// Adicionar linha inicial
addRow();

// Lógica de Geração de IA
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
                    // Chamar API Electron (Processo Principal)
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

// Lógica de Início do Bot
btnStartBot.addEventListener('click', async () => {
    log('Iniciando processamento do Bot...');
    const dataToProcess = [];

    const rows = document.querySelectorAll('#ticket-queue-body tr');
    rows.forEach(tr => {
        const client = tr.querySelector('.input-client').value;
        const dept = tr.querySelector('.input-dept').value;
        const category = tr.querySelector('.input-cat').value;
        const summary = tr.querySelector('.input-summary').value;
        const message = tr.querySelector('.input-message').value;
        const resolve = tr.querySelector('.input-resolve').checked;

        if (client && summary) {
            dataToProcess.push({
                id: tr.dataset.id,
                client, dept, category, summary, message, resolve
            });
        }
    });

    if (dataToProcess.length === 0) {
        log('❌ Erro: Preencha pelo menos uma linha completa (Cliente e Resumo) antes de iniciar.');
        // alert('Preencha os campos obrigatórios!'); // REMOVED to avoid blocking
        return;
    }

    log(`Enviando ${dataToProcess.length} tickets para o bot.`);

    // Chamar API Electron
    const credentials = {
        account: document.getElementById('settings-account').value,
        email: document.getElementById('settings-email').value,
        password: document.getElementById('settings-password').value,
        browser: document.getElementById('settings-browser').value
    };

    // Validate credentials if needed, but for now we pass them
    const result = await window.electronAPI.startBot(dataToProcess, credentials);
    log(`Resultado: ${result.message}`);
});

// --- Sincronizar Dados ---
async function syncData() {
    const token = localStorage.getItem('tomticketToken');
    if (!token) return;

    log('Sincronizando Departamentos e Categorias...');

    // Departamentos
    const depResult = await window.electronAPI.tomticketApi(token, 'departments');
    if (depResult.success && depResult.data) {
        DEPARTMENTS = depResult.data.map(d => d.name).sort();
        // Also map IDs if needed for categories, but for now we just use names for UI
        // Store full objects for mapping later?
        // Let's store full objects in memory
        window.fullDepartments = depResult.data;
        localStorage.setItem('cachedDepartments', JSON.stringify(DEPARTMENTS)); // Cache names
        localStorage.setItem('cachedFullDepartments', JSON.stringify(depResult.data));
        log(`Departamentos atualizados: ${DEPARTMENTS.length}`);
    }

    // 2. Categorias (Busca Sequencial para evitar Erros 429)
    if (window.fullDepartments) {
        let allCats = new Set();
        let count = 0;
        const total = window.fullDepartments.length;

        // Buscar sequencialmente
        for (const dep of window.fullDepartments) {
            count++;
            // Atualizar status do botão para mostrar progresso com spinner
            const btnSave = document.getElementById('btn-save-settings');
            if (btnSave) {
                btnSave.innerHTML = `<span class="spinner"></span> Sincronizando... (${count}/${total})`;
            }

            try {
                const catResult = await window.electronAPI.tomticketApi(token, 'categories', { departmentId: dep.id });
                if (catResult.success && catResult.data) {
                    catResult.data.forEach(c => allCats.add(c.name));
                }
                // Pequeno atraso para ser gentil com a API
                await new Promise(r => setTimeout(r, 200));
            } catch (err) {
                console.error(`Falha ao buscar categorias do depto ${dep.id}`, err);
            }
        }

        CATEGORIES = Array.from(allCats).sort();
        localStorage.setItem('cachedCategories', JSON.stringify(CATEGORIES));
        log(`Categorias atualizadas: ${CATEGORIES.length}`);
    }

    // 4. Atualizar UI imediatamente (Linhas Existentes)
    updateDropdownsInExistingRows();
}

function updateDropdownsInExistingRows() {
    const deptRows = document.querySelectorAll('.input-dept');
    const catRows = document.querySelectorAll('.input-cat');

    const deptOptions = DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    const catOptions = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

    deptRows.forEach(select => {
        const currentVal = select.value;
        select.innerHTML = deptOptions;
        if (DEPARTMENTS.includes(currentVal)) select.value = currentVal;
    });

    catRows.forEach(select => {
        const currentVal = select.value;
        select.innerHTML = catOptions;
        if (CATEGORIES.includes(currentVal)) select.value = currentVal;
        else if (CATEGORIES.length > 0) select.value = CATEGORIES[0]; // Default to first if lost
    });
}

// Carregar Dados em Cache
const cachedDeps = localStorage.getItem('cachedDepartments');
const cachedCats = localStorage.getItem('cachedCategories');
if (cachedDeps) DEPARTMENTS = JSON.parse(cachedDeps);
if (cachedCats) CATEGORIES = JSON.parse(cachedCats);


// Salvar Configurações
btnSaveSettings.addEventListener('click', async () => {
    const email = document.getElementById('settings-email').value;
    const account = document.getElementById('settings-account').value;
    const token = document.getElementById('apiToken').value.trim();

    if (token) {
        localStorage.setItem('tomticketToken', token);

        // Iniciar Sync com Feedback no Botão Salvar
        const originalText = btnSaveSettings.innerText;
        btnSaveSettings.disabled = true;
        btnSaveSettings.innerHTML = '<span class="spinner"></span> Sincronizando...';

        await syncData(); // A função syncData vai atualizar o texto deste botão

        // Restaurar botão
        btnSaveSettings.disabled = false;
        btnSaveSettings.innerText = "Salvo! ✅";
        btnSaveSettings.style.backgroundColor = "var(--success-color)";
        btnSaveSettings.style.color = "#1e1e2e";

        setTimeout(() => {
            btnSaveSettings.innerText = "Salvar Credenciais"; // Restaurar texto original fixo
            btnSaveSettings.style.backgroundColor = "";
            btnSaveSettings.style.color = "";
        }, 3000);
    } else {
        // Apenas feedback visual se não tiver token para sync
        const originalText = btnSaveSettings.innerText;
        btnSaveSettings.innerText = "Salvo (Sem Token)!";
        setTimeout(() => btnSaveSettings.innerText = originalText, 2000);
    }

    localStorage.setItem('tomticketEmail', email);
    localStorage.setItem('tomticketAccount', account);
    localStorage.setItem('tomticketBrowser', document.getElementById('settings-browser').value);

    log(`Credenciais atualizadas: Conta [${account}] / Email [${email}] / Token [${token ? 'Definido' : 'Vazio'}]`);
});

// --- Lógica de Integração da API ---
const btnLoadApiTickets = document.getElementById('btnLoadApiTickets');
const apiStatus = document.getElementById('apiStatus');
const operatorFilter = document.getElementById('operatorFilter');
let allTickets = [];

// Remove separate btnSaveToken listener if it existed, merged into btnSaveSettings above

btnLoadApiTickets.addEventListener('click', async () => {
    const token = document.getElementById('apiToken').value.trim();
    if (!token) {
        apiStatus.innerText = '⚠️ Token não configurado nas Configurações.';
        return;
    }

    btnLoadApiTickets.disabled = true;
    btnLoadApiTickets.innerText = 'Carregando...';
    apiStatus.innerText = 'Buscando chamados...';

    // Ocultar estado vazio se existir
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) emptyState.style.display = 'none';

    const result = await window.electronAPI.tomticketApi(token);

    btnLoadApiTickets.disabled = false;
    btnLoadApiTickets.innerText = '🔄 Buscar Meus Chamados'; // Restore original text

    if (result.success && result.data) {
        allTickets = result.data;
        apiStatus.innerText = `${allTickets.length} chamados.`;

        // Mostrar container da tabela
        document.getElementById('manager-table-container').classList.remove('hidden');

        populateOperatorFilter(allTickets);
        renderTickets(allTickets);
    } else {
        apiStatus.innerText = `Erro: ${result.message}`;
    }
});

function populateOperatorFilter(tickets) {
    const operators = new Map();
    tickets.forEach(t => {
        if (t.operator) {
            operators.set(t.operator.id, t.operator.name);
        }
    });

    operatorFilter.style.display = 'inline-block';
    operatorFilter.innerHTML = '<option value="">Todos os Atendentes</option>';

    operators.forEach((name, id) => {
        const option = document.createElement('option');
        option.value = id;
        option.innerText = name;
        operatorFilter.appendChild(option);
    });
}

operatorFilter.addEventListener('change', () => {
    const selectedId = operatorFilter.value;
    if (selectedId) {
        const filtered = allTickets.filter(t => t.operator && t.operator.id === selectedId);
        renderTickets(filtered);
    } else {
        renderTickets(allTickets);
    }
});

function renderTickets(tickets) {
    const tbody = document.getElementById('manager-queue-body');
    tbody.innerHTML = '';

    tickets.forEach(ticket => {
        const tr = document.createElement('tr');

        const protocol = ticket.protocol || ticket.id;
        const subject = ticket.subject || 'Sem Assunto';
        const client = ticket.customer ? ticket.customer.name : 'Desconhecido';
        // const situation = ticket.situation ? ticket.situation.description : 'N/A';
        // const operator = ticket.operator ? ticket.operator.name : 'Ninguém';

        tr.innerHTML = `
            <td><input type="checkbox"></td>
            <td>${protocol}</td>
            <td>${subject}</td>
            <td>${client}</td>
            <td>
                <button class="btn secondary" style="padding: 2px 5px;" onclick="setupBotFromTicket('${ticket.id}')">Usar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.setupBotFromTicket = (ticketId) => {
    const ticket = allTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    // Switch to Queue Tab
    // Use try-catch for DOM manipulation safety
    try {
        const queueTab = document.querySelector('[data-tab="queue"]');
        if (queueTab) queueTab.click();
    } catch (e) { console.error(e); }

    // Add Row
    addRow();

    // Fill Last Row
    const rows = document.querySelectorAll('#ticket-queue-body tr');
    const lastRow = rows[rows.length - 1];

    if (ticket.customer) lastRow.querySelector('.input-client').value = ticket.customer.name;

    if (ticket.department) {
        const deptSelect = lastRow.querySelector('.input-dept');
        // Try to match exact text
        for (let i = 0; i < deptSelect.options.length; i++) {
            if (deptSelect.options[i].text === ticket.department.name) {
                deptSelect.selectedIndex = i;
                break;
            }
        }
    }

    if (ticket.category) {
        const catSelect = lastRow.querySelector('.input-cat');
        // Try to match exact text
        for (let i = 0; i < catSelect.options.length; i++) {
            if (catSelect.options[i].text === ticket.category.name) {
                catSelect.selectedIndex = i;
                break;
            }
        }
    }

    if (ticket.subject) lastRow.querySelector('.input-summary').value = ticket.subject;

    // Feedback visual (Efeito Flash)
    lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lastRow.style.transition = 'background-color 0.5s';
    lastRow.style.backgroundColor = '#d1e7dd'; // Green-ish highlight
    setTimeout(() => lastRow.style.backgroundColor = '', 1500);
};
