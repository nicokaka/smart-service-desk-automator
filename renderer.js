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
    }

    // --- Load Cached Data (MOVED HERE to ensure availability for first row) ---
    const cachedDepts = localStorage.getItem('cachedDepartments');
    const cachedCats = localStorage.getItem('cachedCategories');
    const cachedCust = localStorage.getItem('cachedCustomers');
    const cachedFullDepts = localStorage.getItem('cachedFullDepartments');
    const cachedFullCust = localStorage.getItem('cachedFullCustomers');
    const cachedOps = localStorage.getItem('cachedOperators');

    if (cachedDepts) DEPARTMENTS = JSON.parse(cachedDepts);
    if (cachedCats) CATEGORIES = JSON.parse(cachedCats);
    if (cachedCust) CUSTOMERS = JSON.parse(cachedCust);
    if (cachedFullDepts) window.fullDepartments = JSON.parse(cachedFullDepts);
    if (cachedFullCust) window.fullCustomers = JSON.parse(cachedFullCust);
    if (cachedOps) OPERATORS = JSON.parse(cachedOps);

    // Initialize Datalist from Cache
    if (CUSTOMERS.length > 0) {
        const datalist = document.getElementById('clients-list');
        if (datalist) datalist.innerHTML = CUSTOMERS.map(c => `<option value="${c}">`).join('');
    }

    // --- Load Saved Credentials ---
    const savedAccount = localStorage.getItem('tomticketAccount');
    const savedEmail = localStorage.getItem('tomticketEmail');
    const savedBrowser = localStorage.getItem('tomticketBrowser');
    const savedGeminiKey = localStorage.getItem('geminiApiKey');
    const saveCredentialsState = localStorage.getItem('saveCredentialsState') === 'true';

    // Restore checkbox state
    const chkSaveCredentials = document.getElementById('chk-save-credentials');
    if (chkSaveCredentials) {
        chkSaveCredentials.checked = saveCredentialsState;
    }

    if (savedAccount) document.getElementById('settings-account').value = savedAccount;
    if (savedEmail) document.getElementById('settings-email').value = savedEmail;
    if (savedBrowser) document.getElementById('settings-browser').value = savedBrowser;
    if (savedGeminiKey) document.getElementById('geminiApiKey').value = savedGeminiKey;

    // Restore Password ONLY if checkbox was checked
    if (saveCredentialsState) {
        const savedPassword = localStorage.getItem('tomticketPassword');
        if (savedPassword) document.getElementById('settings-password').value = savedPassword;
    }

    // Optional: Sync only if really empty (paranoid check)
    if (!localStorage.getItem('cachedDepartments') && savedToken) {
        // syncData(); // Disable auto-sync to let user control it via button
    }

    // Add initial row AFTER cache is loaded
    addRow();
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
    `;

    // Adicionar listener para checkbox da linha
    const checkbox = tr.querySelector('.row-select');
    checkbox.addEventListener('change', toggleRemoveButton);

    tableBody.appendChild(tr);
}

// Checkbox change listener is now added in addRow
// window.removeRow removal logic handled by btnRemoveSelected logic now


btnAddRow.addEventListener('click', addRow);

// Adicionar linha inicial (Moved to DOMContentLoaded)

// Lógica de Geração de IA
btnGenerateAI.addEventListener('click', async () => {
    log('Solicitando geração de texto...');
    let rows = Array.from(document.querySelectorAll('#ticket-queue-body tr'));

    // Check if any row is selected
    const anySelected = rows.some(tr => tr.querySelector('.row-select').checked);

    // Filter rows: If any selected, use those. Otherwise, use ALL rows.
    const rowsToProcess = anySelected
        ? rows.filter(tr => tr.querySelector('.row-select').checked)
        : rows;

    if (rowsToProcess.length === 0) {
        log('Nenhuma linha para processar.');
        return;
    }

    log(`Processando ${rowsToProcess.length} linhas com IA...`);

    for (const tr of rowsToProcess) {
        const summary = tr.querySelector('.input-summary').value;
        const messageInput = tr.querySelector('.input-message');

        if (summary) {
            messageInput.value = "Gerando...";
            try {
                // Recuperar chave da API da UI/Storage
                const apiKey = localStorage.getItem('geminiApiKey') || document.getElementById('geminiApiKey').value;
                const clientName = tr.querySelector('.input-client').value || "Cliente";

                // Chamar API Electron (Processo Principal)
                const aiResponse = await window.electronAPI.generateAI(summary, clientName, apiKey);

                try {
                    const aiData = JSON.parse(aiResponse);
                    // Atualizar Assunto e Descrição
                    if (aiData.descricao) messageInput.value = aiData.descricao;
                    // Removed title update logic as per user request (AI only generates description)
                    log(`IA gerou texto para linha ${tr.dataset.id} (TomTicket)`);
                } catch (parseError) {
                    console.warn("Falha ao processar JSON da IA, usando texto bruto.", parseError);
                    messageInput.value = aiResponse; // Fallback
                }
            } catch (error) {
                messageInput.value = "Erro na IA";
                console.warn(error);
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

        if (client && summary) {
            dataToProcess.push({
                id: tr.dataset.id,
                client, dept, category, attendant, summary, message
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

    // Resultado Processamento
    log(`Resultado Geral: ${result.message}`);

    if (result.details && Array.isArray(result.details)) {
        result.details.forEach(item => {
            const tr = document.querySelector(`tr[data-id="${item.id}"]`);
            if (tr) {
                if (item.status === 'Success') {
                    // Visual Green Success
                    tr.style.backgroundColor = '#d1e7dd';
                    const msgInput = tr.querySelector('.input-message');
                    if (msgInput) msgInput.value += " ✅ [CRIADO]";

                    // Disable inputs and fix contrast (Dark text on light green)
                    const inputs = tr.querySelectorAll('input, select');
                    inputs.forEach(input => {
                        input.disabled = true;
                        input.style.color = '#000000'; // Black text for readability
                        input.style.fontWeight = '500';
                    });
                } else {
                    // Visual Red Error
                    tr.style.backgroundColor = '#f8d7da';
                    // Error text allows white/default usually, but let's ensure readability if needed
                    // For now, red bg usually pairs with dark text in Bootstrap danges
                    tr.style.color = '#721c24';
                    log(`❌ Erro na linha ${item.id}: ${item.message}`);
                }
            }
        });
    }
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

            // Ensure "Nicolas" is present if not already
            const nicolasExists = OPERATORS.some(op => op.name.toLowerCase().includes('nicolas'));
            if (!nicolasExists) {
                // Add dummy object for Nicolas if not in API
                OPERATORS.push({ id: 'custom-nicolas', name: 'Nicolas' });
                OPERATORS.sort((a, b) => a.name.localeCompare(b.name));
            }

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
// (Cache loading moved to top)


// Salvar Configurações
btnSaveSettings.addEventListener('click', async () => {
    const email = document.getElementById('settings-email').value;
    const account = document.getElementById('settings-account').value;
    const password = document.getElementById('settings-password').value;
    const browser = document.getElementById('settings-browser').value;
    const token = document.getElementById('apiToken').value.trim();
    const chkSave = document.getElementById('chk-save-credentials');
    const shouldSave = chkSave ? chkSave.checked : false;

    if (!account || !email || !password || !token) {
        alert('Por favor, preencha todos os campos!');
        return;
    }

    // 1. Save critical credentials based on Checkbox
    if (shouldSave) {
        localStorage.setItem('tomticketAccount', account);
        localStorage.setItem('tomticketEmail', email);
        localStorage.setItem('tomticketPassword', password);
    } else {
        localStorage.removeItem('tomticketAccount');
        localStorage.removeItem('tomticketEmail');
        localStorage.removeItem('tomticketPassword');
    }
    localStorage.setItem('saveCredentialsState', shouldSave);

    // 2. Save General Settings (Always)
    localStorage.setItem('tomticketBrowser', browser);
    localStorage.setItem('geminiApiKey', document.getElementById('geminiApiKey').value.trim());

    // 3. Handle Token and Sync
    if (token) {
        localStorage.setItem('tomticketToken', token);

        // UI Feedback
        const originalText = btnSaveSettings.innerText;
        btnSaveSettings.disabled = true;
        btnSaveSettings.innerHTML = '<span class="spinner"></span> Sincronizando...';

        await syncData();

        // Restore UI
        btnSaveSettings.disabled = false;
        btnSaveSettings.innerText = "Salvo! ✅";
        btnSaveSettings.style.backgroundColor = "var(--success-color)";
        btnSaveSettings.style.color = "#1e1e2e";

        setTimeout(() => {
            btnSaveSettings.innerText = "Sincronizar Dados";
            btnSaveSettings.style.backgroundColor = "";
            btnSaveSettings.style.color = "";
        }, 3000);
    } else {
        // No token provided
        localStorage.removeItem('tomticketToken');
        alert('Configurações salvas, mas sem Token não é possível sincronizar.');
    }

    log(`Credenciais atualizadas: Conta [${account}] / Email [${email}] / Salvar? [${shouldSave ? 'Sim' : 'Não'}]`);
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

    if (tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum chamado encontrado.</td></tr>';
        return;
    }

    tickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.dataset.id = ticket.id;
        tr.dataset.title = ticket.subject;
        tr.dataset.description = ticket.description || ticket.subject;
        tr.dataset.client = ticket.customer ? ticket.customer.name : 'Cliente';

        const protocol = ticket.protocol || ticket.id;
        const subject = ticket.subject || 'Sem Assunto';
        const client = ticket.customer ? ticket.customer.name : 'Desconhecido';

        tr.innerHTML = `
            <td><input type="checkbox" class="manager-check"></td>
            <td>${protocol}</td>
            <td>${subject}</td>
            <td>${client}</td>
            <td>
                <textarea class="input-solution" rows="1" placeholder="Mensagem de encerramento..."></textarea>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Select All Logic
    const selectAllInfo = document.getElementById('select-all-manager');
    if (selectAllInfo) {
        selectAllInfo.addEventListener('change', (e) => {
            document.querySelectorAll('.manager-check').forEach(chk => chk.checked = e.target.checked);
        });
    }
}

// Botão: Gerar Solução com IA
const btnGenerateSolutionAI = document.getElementById('btnGenerateSolutionAI');
if (btnGenerateSolutionAI) {
    btnGenerateSolutionAI.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#manager-queue-body tr');
        let selectedRows = Array.from(rows).filter(tr => tr.querySelector('.manager-check').checked);

        // Se ninguem selecionado, faz em todos (Smart Bulk)
        if (selectedRows.length === 0 && rows.length > 0) {
            selectedRows = Array.from(rows);
        }

        if (selectedRows.length === 0) return;

        log(`Gerando solução para ${selectedRows.length} chamados...`);
        const apiKey = localStorage.getItem('geminiApiKey') || document.getElementById('geminiApiKey').value;

        for (const tr of selectedRows) {
            const solutionInput = tr.querySelector('.input-solution');
            if (solutionInput) {
                solutionInput.value = "Gerando...";
                try {
                    const title = tr.dataset.title;
                    const desc = tr.dataset.description;
                    const client = tr.dataset.client;

                    const aiResponse = await window.electronAPI.generateSolutionAI(title, desc, client, apiKey);

                    try {
                        const json = JSON.parse(aiResponse);
                        if (json.solucao) solutionInput.value = json.solucao;
                    } catch (e) {
                        solutionInput.value = aiResponse;
                    }

                } catch (err) {
                    console.error(err);
                    solutionInput.value = "Erro na IA.";
                }
            }
        }
    });
}

// Botão: Fechar Selecionados
const btnCloseSelected = document.getElementById('btnCloseSelected');
if (btnCloseSelected) {
    btnCloseSelected.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#manager-queue-body tr');
        const selectedRows = Array.from(rows).filter(tr => tr.querySelector('.manager-check').checked);

        if (selectedRows.length === 0) {
            alert('Selecione pelo menos um chamado para fechar.');
            return;
        }

        const ticketsToClose = selectedRows.map(tr => ({
            id: tr.dataset.id,
            solution: tr.querySelector('.input-solution').value
        }));

        // Validate solutions
        if (ticketsToClose.some(t => !t.solution || t.solution === 'Gerando...' || t.solution === 'Erro na IA.')) {
            if (!confirm('Alguns chamados estão sem solução definida. Deseja continuar mesmo assim?')) return;
        }

        log(`Iniciando fechamento de ${ticketsToClose.length} chamados...`);

        const credentials = {
            account: localStorage.getItem('tomticketAccount'),
            email: localStorage.getItem('tomticketEmail'),
            password: localStorage.getItem('tomticketPassword'),
            browser: localStorage.getItem('tomticketBrowser'),
            token: localStorage.getItem('tomticketToken') // ADDING TOKEN FOR API usage
        };

        const result = await window.electronAPI.closeTickets(ticketsToClose, credentials);
        log(`Resultado Fechamento: ${result.message}`);

        // Visual Feedback
        if (result.details && Array.isArray(result.details)) {
            result.details.forEach(item => {
                const tr = document.querySelector(`tr[data-id="${item.id}"]`);
                if (tr) {
                    if (item.status === 'Success') {
                        tr.style.backgroundColor = '#d1e7dd'; // Green
                        const inputs = tr.querySelectorAll('input, textarea');
                        inputs.forEach(input => {
                            input.disabled = true;
                            input.style.color = '#000000';
                            input.style.fontWeight = 'bold';
                        });
                    } else {
                        tr.style.backgroundColor = '#f8d7da'; // Red
                        tr.style.color = '#721c24';
                    }
                }
            });
        }
    });
}
