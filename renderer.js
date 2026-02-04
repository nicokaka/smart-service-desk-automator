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

let CUSTOMERS = [];

// Lista de Operadores (Será sobrescrita pela API)
let OPERATORS = [];

const btnRemoveSelected = document.getElementById('btn-remove-selected');
const selectAllCheckbox = document.getElementById('select-all');

// Checkbox "Selecionar Todos"
if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.row-select');
        checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        toggleRemoveButton();
    });
}

// Botão "Excluir Selecionados"
if (btnRemoveSelected) {
    btnRemoveSelected.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.row-select:checked');
        checkboxes.forEach(cb => {
            const tr = cb.closest('tr');
            tr.remove();
        });
        toggleRemoveButton();
        if (document.querySelectorAll('#ticket-queue-body tr').length === 0) {
            rowCount = 0; // Reset counter if empty
            addRow(); // Always keep at least one row
        }
    });
}

function toggleRemoveButton() {
    const checked = document.querySelectorAll('.row-select:checked').length;
    if (btnRemoveSelected) {
        btnRemoveSelected.style.display = checked > 0 ? 'inline-block' : 'none';
    }
}

// Grade: Adicionar Linha
function addRow() {
    rowCount++;
    const tr = document.createElement('tr');
    tr.dataset.id = rowCount;

    // Criar Opções de Departamento
    const deptOptions = `<option value="">Selecione...</option>` + DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    // Criar Opções de Categoria
    const catOptions = `<option value="">Selecione...</option>` + CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    // Criar Opções de Cliente
    const clientOptions = `<option value="">Selecione...</option>` + CUSTOMERS.map(c => `<option value="${c}">${c}</option>`).join('');
    // Criar Opções de Operador
    const operatorOptions = `<option value="">Selecione...</option>` + OPERATORS.map(o => `<option value="${o.name}">${o.name}</option>`).join('');

    tr.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td>
            <select class="input-client input-field" style="padding:5px;">
                ${clientOptions}
            </select>
        </td>
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
        <td>
            <select class="input-attendant input-field" style="padding:5px;">
                ${operatorOptions}
            </select>
        </td>
        <td><input type="text" placeholder="Ex: Internet lenta" class="input-summary"></td>
        <td><input type="text" placeholder="Aguardando IA..." class="input-message" disabled></td>
        <td>
            <label style="font-size:0.8rem; display:flex; align-items:center; gap:5px; justify-content:center;">
                <input type="checkbox" class="input-resolve">
            </label>
        </td>
    `;

    // Adicionar listener para checkbox da linha
    const checkbox = tr.querySelector('.row-select');
    checkbox.addEventListener('change', toggleRemoveButton);

    tableBody.appendChild(tr);
}

// Checkbox change listener is now added in addRow
// window.removeRow removal logic handled by btnRemoveSelected logic now


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
        const attendant = tr.querySelector('.input-attendant').value;
        const summary = tr.querySelector('.input-summary').value;
        const message = tr.querySelector('.input-message').value;
        const resolve = tr.querySelector('.input-resolve').checked;

        if (client && summary) {
            dataToProcess.push({
                id: tr.dataset.id,
                client, dept, category, attendant, summary, message, resolve
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

    // 4. Operadores (Atendentes) - MOVIDO PARA ANTES DAS CATEGORIAS (Prioridade)
    const btnSaveOp = document.getElementById('btn-save-settings');
    if (btnSaveOp) btnSaveOp.innerHTML = `<span class="spinner"></span> Sincronizando Atendentes...`;

    try {
        const opResult = await window.electronAPI.tomticketApi(token, 'operators');
        if (opResult.success && opResult.data) {
            OPERATORS = opResult.data.sort((a, b) => a.name.localeCompare(b.name));
            localStorage.setItem('cachedOperators', JSON.stringify(OPERATORS));
            log(`Atendentes atualizados: ${OPERATORS.length}`);
        }
    } catch (err) {
        console.error('Falha ao buscar atendentes', err);
        log('Erro ao buscar atendentes.');
    }

    // 2. Categorias (Busca Otimizada com Throttling)
    if (window.fullDepartments) {
        let allCats = new Set();
        let count = 0;
        const total = window.fullDepartments.length;

        // Otimização: Buscar em lotes menores para evitar bloqueio
        const batchSize = 3; // Reduzido de 5 para 3 para segurança
        for (let i = 0; i < total; i += batchSize) {
            const batch = window.fullDepartments.slice(i, i + batchSize);

            await Promise.all(batch.map(async (dep) => {
                try {
                    const catResult = await window.electronAPI.tomticketApi(token, 'categories', { departmentId: dep.id });
                    if (catResult.success && catResult.data) {
                        catResult.data.forEach(c => allCats.add(c.name));
                    }
                } catch (err) {
                    console.error(`Falha ao buscar categorias do depto ${dep.id}`, err);
                }
            }));

            count += batch.length;
            // Atualizar status do botão
            const btnSave = document.getElementById('btn-save-settings');
            if (btnSave) {
                btnSave.innerHTML = `<span class="spinner"></span> Sincronizando... (${Math.min(count, total)}/${total})`;
            }
            // Aumentar delay para evitar "429 Too Many Requests" ou bloqueio de IP
            await new Promise(r => setTimeout(r, 300));
        }

        CATEGORIES = Array.from(allCats).sort();
        localStorage.setItem('cachedCategories', JSON.stringify(CATEGORIES));
        log(`Categorias atualizadas: ${CATEGORIES.length}`);
    }

    // 3. Clientes
    const btnSave = document.getElementById('btn-save-settings');
    if (btnSave) btnSave.innerHTML = `<span class="spinner"></span> Sincronizando Clientes (Pode demorar)...`;

    // Pequeno delay
    await new Promise(r => setTimeout(r, 500));

    try {
        const clientResult = await window.electronAPI.tomticketApi(token, 'customers');
        if (clientResult.success && clientResult.data) {
            // Armazenar objetos completos para lookup de ID depois
            window.fullCustomers = clientResult.data;
            CUSTOMERS = clientResult.data.map(c => c.name).sort();

            localStorage.setItem('cachedCustomers', JSON.stringify(CUSTOMERS));
            localStorage.setItem('cachedFullCustomers', JSON.stringify(clientResult.data));

            log(`Clientes atualizados: ${CUSTOMERS.length}`);
        }
    } catch (err) {
        console.error('Falha ao buscar clientes', err);
        log('Erro ao buscar clientes.');
    }

    // 5. Atualizar UI imediatamente (Linhas Existentes)
    updateDropdownsInExistingRows();
}

function updateDropdownsInExistingRows() {
    const deptRows = document.querySelectorAll('.input-dept');
    const catRows = document.querySelectorAll('.input-cat');
    const clientRows = document.querySelectorAll('.input-client');
    const attendantRows = document.querySelectorAll('.input-attendant');

    const deptOptions = `<option value="">Selecione...</option>` + DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    const catOptions = `<option value="">Selecione...</option>` + CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    // Ordenar clientes para facilitar busca visual se não for feito na API
    // CUSTOMERS.sort() // Já deve vir ordenado do cache
    const clientOptions = `<option value="">Selecione...</option>` + CUSTOMERS.map(c => `<option value="${c}">${c}</option>`).join('');
    const operatorOptions = `<option value="">Selecione...</option>` + OPERATORS.map(o => `<option value="${o.name}">${o.name}</option>`).join('');

    // Helper segura para atualizar e manter valor
    const updateSelect = (select, opts, validList) => {
        const keptValue = select.value;
        select.innerHTML = opts;
        // Se tinha valor e ele ainda existe, mantém. Se não tinha valor (nova linha), fica vazio.
        if (keptValue && validList.includes(keptValue)) {
            select.value = keptValue;
        } else {
            select.value = ""; // Default to empty
        }
    };

    deptRows.forEach(select => updateSelect(select, deptOptions, DEPARTMENTS));
    catRows.forEach(select => updateSelect(select, catOptions, CATEGORIES));
    clientRows.forEach(select => updateSelect(select, clientOptions, CUSTOMERS));
    // ValidList validation for operators is tricky since OPERATORS is objects. For now just map names
    const operatorNames = OPERATORS.map(o => o.name);
    attendantRows.forEach(select => updateSelect(select, operatorOptions, operatorNames));
}

// Fim da configuração

// Carregar Dados em Cache
const cachedDeps = localStorage.getItem('cachedDepartments');
const cachedCats = localStorage.getItem('cachedCategories');
const cachedCust = localStorage.getItem('cachedCustomers');
const cachedFullCust = localStorage.getItem('cachedFullCustomers');
const cachedOps = localStorage.getItem('cachedOperators');

if (cachedDeps) DEPARTMENTS = JSON.parse(cachedDeps);
if (cachedCats) CATEGORIES = JSON.parse(cachedCats);
if (cachedCust) CUSTOMERS = JSON.parse(cachedCust);
if (cachedFullCust) window.fullCustomers = JSON.parse(cachedFullCust);
if (cachedOps) OPERATORS = JSON.parse(cachedOps);

// Inicializar Datalist se houver cache
if (CUSTOMERS.length > 0) {
    const datalist = document.getElementById('clients-list');
    if (datalist) datalist.innerHTML = CUSTOMERS.map(c => `<option value="${c}">`).join('');
}


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
