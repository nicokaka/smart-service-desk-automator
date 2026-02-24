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

    // Safety check for fullCategories
    const cachedFullCats = localStorage.getItem('cachedFullCategories');
    if (cachedFullCats) window.fullCategories = JSON.parse(cachedFullCats);

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

    // Maintain previous logic...
    if (saveCredentialsState) {
        const savedPassword = localStorage.getItem('tomticketPassword');
        if (savedPassword) document.getElementById('settings-password').value = savedPassword;
    }

    // Restore Turbo Mode state
    const savedTurboMode = localStorage.getItem('turboMode') === 'true';
    const chkTurbo = document.getElementById('chk-turbo-mode');
    if (chkTurbo) {
        chkTurbo.checked = savedTurboMode;
    }

    // Optional: Sync only if really empty (paranoid check)
    if (!localStorage.getItem('cachedDepartments') && savedToken) {
        // syncData(); // Disable auto-sync to let user control it via button
    }

    // Restore Queue State (Persistence)
    restoreQueueState();
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
function addRow(data = null) {
    try {
        console.log("addRow() called", data ? "with data" : "empty");
        rowCount++;
        const tr = document.createElement('tr');
        tr.dataset.id = rowCount;

        // Ensure globals are at least empty arrays to prevent map errors
        const depts = window.fullDepartments || [];
        const cats = CATEGORIES || [];
        const custs = CUSTOMERS || [];
        const ops = OPERATORS || [];

        // Helper to create options with selected value
        const createOptions = (list, selectedValue, isObj = false) => {
            return `<option value="">Selecione...</option>` + list.map(item => {
                const val = isObj ? item.id : item; // ID if obj, self if string
                const label = isObj ? item.name : item;
                const availableVal = isObj ? item.id : item;
                // loose comparison for ID strings vs numbers
                const selected = String(availableVal) === String(selectedValue || '') ? 'selected' : '';
                return `<option value="${val}" ${selected}>${label}</option>`;
            }).join('');
        };

        const deptOptions = createOptions(depts, data?.deptId, true);
        const catOptions = createOptions(cats, data?.catName, false);
        const clientOptions = createOptions(custs, data?.clientName, false);
        const operatorOptions = createOptions(ops, data?.attendantId, true);

        tr.innerHTML = `
            <td><input type="checkbox" class="row-select" ${data?.selected ? 'checked' : ''}></td>
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
            <td><input type="text" placeholder="Ex: Internet lenta" class="input-summary" value="${data?.subject || ''}"></td>
            <td><input type="text" placeholder="Aguardando IA..." class="input-message" disabled value="${data?.message || ''}"></td>
        `;

        const checkbox = tr.querySelector('.row-select');
        checkbox.addEventListener('change', toggleRemoveButton);

        // Auto-save listeners (Persistence)
        const inputs = tr.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', saveQueueState);
            input.addEventListener('input', saveQueueState);
        });

        tableBody.appendChild(tr);
        if (!data) saveQueueState(); // Save new empty row

    } catch (e) {
        console.error("Error in addRow:", e);
        alert("Erro ao adicionar linha: " + e.message);
    }
}

// Persistência da Fila
function saveQueueState() {
    const rows = [];
    document.querySelectorAll('#ticket-queue-body tr').forEach(tr => {
        rows.push({
            clientName: tr.querySelector('.input-client').value,
            deptId: tr.querySelector('.input-dept').value,
            catName: tr.querySelector('.input-cat').value,
            attendantId: tr.querySelector('.input-attendant').value,
            subject: tr.querySelector('.input-summary').value,
            message: tr.querySelector('.input-message').value,
            selected: tr.querySelector('.row-select').checked
        });
    });
    localStorage.setItem('ticketQueueState', JSON.stringify(rows));
}

function restoreQueueState() {
    const saved = localStorage.getItem('ticketQueueState');
    if (saved) {
        try {
            const rows = JSON.parse(saved);
            if (Array.isArray(rows) && rows.length > 0) {
                console.log('Restoring queue:', rows.length);
                tableBody.innerHTML = '';
                rowCount = 0;
                rows.forEach(rowData => addRow(rowData));
                return;
            }
        } catch (e) {
            console.error('Failed to restore queue:', e);
        }
    }
    // Default if no save found
    addRow();
}

// Event Listener para adicionar linha
if (btnAddRow) {
    btnAddRow.addEventListener('click', addRow);
}

// Lógica de Execução do Bot (Create Tickets)
// const btnStartBot = document.getElementById('btn-start-bot'); // Already declared at top
btnStartBot.addEventListener('click', async () => {
    let rows = Array.from(document.querySelectorAll('#ticket-queue-body tr'));
    const anySelected = rows.some(tr => tr.querySelector('.row-select').checked);
    const rowsToProcess = anySelected ? rows.filter(tr => tr.querySelector('.row-select').checked) : rows;

    if (rowsToProcess.length === 0) {
        log('Nenhuma linha para processar.');
        return;
    }

    const token = localStorage.getItem('tomticketToken');

    // --- MODO API (Preferencial) ---
    if (token) {
        log(`Iniciando criação via API (${rowsToProcess.length} chamados)...`);

        let i = 0;
        for (const tr of rowsToProcess) {
            i++;
            try {
                // 1. Coletar Dados
                const clientName = tr.querySelector('.input-client').value;
                const deptId = tr.querySelector('.input-dept').value; // Value is ID now
                const catName = tr.querySelector('.input-cat').value; // Value is Name
                const attendantId = tr.querySelector('.input-attendant').value; // Value is ID now
                const subject = tr.querySelector('.input-summary').value;
                const message = tr.querySelector('.input-message').value || subject;

                if (!clientName || !deptId || !subject) {
                    let missing = [];
                    if (!clientName) missing.push("Cliente");
                    if (!deptId) missing.push("Departamento");
                    if (!subject) missing.push("Resumo");
                    log(`ERRO: Linha ${tr.dataset.id} - Dados incompletos. Faltando: ${missing.join(', ')}`);
                    tr.style.backgroundColor = '#f8d7da';
                    continue;
                }

                // 2. Mapear IDs (Cliente e Categoria)
                // Cliente ID
                // Ensure fullCustomers is loaded
                if (!window.fullCustomers || window.fullCustomers.length === 0) {
                    log(`❌ ERRO CRÍTICO: Lista de Clientes (fullCustomers) está vazia. Tente Sincronizar novamente.`);
                    tr.style.backgroundColor = '#f8d7da';
                    continue;
                }

                // Helper to find ID
                const getSafeId = (obj) => {
                    if (!obj) return null;
                    return obj.id || obj.Id || obj.customer_id || obj.key || obj._id;
                };

                // Debug matching
                if (i === 1) {
                    log(`🔍 DEBUG (Linha ${tr.dataset.id}): Buscando Cliente "${clientName}"...`);
                    log(`📊 Total Clientes Carregados: ${window.fullCustomers ? window.fullCustomers.length : 'ZERO/NULL'}`);
                    if (window.fullCustomers && window.fullCustomers.length > 0) {
                        const sample = window.fullCustomers[0];
                        // console.log("Amostra Cliente:", sample); 
                        log(`📝 Chaves do Cliente: ${Object.keys(sample).join(', ')}`);
                    }
                }

                const searchName = clientName.trim().toLowerCase();
                const customerObj = (window.fullCustomers || []).find(c => {
                    return c.name && c.name.trim().toLowerCase() === searchName;
                });

                let foundId = null;
                if (customerObj) {
                    foundId = getSafeId(customerObj);
                    if (!foundId) {
                        log(`⚠️ Cliente ENCONTRADO mas ID é NULO.`);
                    } else {
                        log(`✅ Cliente ENCONTRADO: "${customerObj.name}" -> ID: ${foundId}`);
                    }
                } else {
                    log(`❌ Cliente NÃO ENCONTRADO na lista interna. Comparado com tag: "${searchName}"`);
                }

                if (!customerObj) {
                    log(`❌ ERRO: Cliente "${clientName}" não encontrado (ID não mapeado).`);
                    tr.style.backgroundColor = '#f8d7da';
                    continue;
                }

                // Categoria ID
                const categoryObj = (window.fullCategories || []).find(c => c.name === catName && c.department_id == deptId);
                const finalCatObj = categoryObj || (window.fullCategories || []).find(c => c.name === catName);

                if (!finalCatObj) {
                    log(`AVISO: Categoria "${catName}" não encontrada. Enviando sem categoria.`);
                }
                const catId = finalCatObj ? finalCatObj.id : null;

                // 3. Montar Payload
                // Fix Priority: User reported '2' as Low. Let's try '1' for Normal or just remove if default is Normal.
                // Documentation says: 1=Low, 2=Normal, 3=High.
                // But user says '2' resulted in Low. Maybe mapped differently?
                // Let's try '2' again but explicitly log it or try '1' if user insists.
                // Wait, if 2 is low, maybe 1 is urgent?
                // Let's look at standard mappings. Usually 0 or 1 is low.
                // Let's try sending '1' and see.
                // Also Attendant ID: Ensure it's not empty string.

                const ticketData = {
                    department_id: deptId,
                    category_id: catId,
                    subject: subject,
                    message: message,
                    priority: '2' // 1=Low, 2=Normal, 3=High. Correct param name is 'priority' NOT 'priority_id'
                };

                // Remove attendant_id from creation payload as it is not supported there

                // Estratégia de Identificação Corrigida via Documentação
                // Se usar Email no customer_id, PRECISA mandar customer_id_type = 'E'
                if (foundId) {
                    ticketData.customer_id = foundId;
                    // Default type is I
                } else if (customerObj.email) {
                    log(`ℹ️ ID Nulo. Usando EMAIL como ID: ${customerObj.email} (Type: E)`);
                    ticketData.customer_id = customerObj.email;
                    ticketData.customer_id_type = 'E'; // CRITICAL: 'E' for Email
                } else {
                    throw new Error("Cliente sem ID e sem Email. Não é possível criar o chamado.");
                }

                // 4. Enviar API (Criar Chamado)
                const result = await window.electronAPI.tomticketApi(token, 'create_ticket', ticketData);

                if (result.success) {
                    // Extract ID from correct field based on user log: "ticket_id"
                    let newTicketId = result.data.ticket_id || result.data.id;

                    if (!newTicketId && result.data.data && result.data.data.id) {
                        newTicketId = result.data.data.id;
                    }

                    if (!newTicketId) {
                        // log(`⚠️ Chamado criado mas ID não identificado. Resposta: ${JSON.stringify(result.data)}`);
                    } else {
                        // log(`Chamado criado! ID: ${newTicketId}`);
                    }

                    // 5. Vincular Atendente (Passo Extra Obrigatório)
                    if (attendantId) {
                        // log(`🔗 Vinculando atendente ID: ${attendantId}...`);
                        try {
                            const linkResult = await window.electronAPI.tomticketApi(token, 'link_attendant', {
                                ticket_id: newTicketId,
                                operator_id: attendantId
                            });
                            if (linkResult.success) {
                                log(`✅ Atendente vinculado com sucesso.`);
                            } else {
                                log(`⚠️ Erro ao vincular atendente: ${linkResult.message}`);
                            }
                        } catch (linkErr) {
                            log(`⚠️ Falha ao vincular atendente: ${linkErr.message}`);
                        }
                    }

                    // Visual Success
                    tr.style.backgroundColor = '#d1e7dd';
                    tr.querySelectorAll('input, select').forEach(el => {
                        el.disabled = true;
                        el.style.color = '#000';
                        el.style.fontWeight = 'bold';
                    });
                } else {
                    throw new Error(result.message);
                }

            } catch (err) {
                console.error(err);
                log(`Erro linha ${tr.dataset.id}: ${err.message}`);
                tr.style.backgroundColor = '#f8d7da';
            }

            // Delay anti-spam
            await new Promise(r => setTimeout(r, 500));
        }

        log('Processamento via API finalizado.');
        return;
    }

    // --- MODO PUPPETEER (Fallback) ---
    // ... (Original logic preserved if no token)
    log('Token não encontrado. Usando modo Navegador (Bot)...');

    // Mapeamento visual para bot legacy
    const tickets = rowsToProcess.map(tr => ({
        id: tr.dataset.id,
        client: tr.querySelector('.input-client').value, // Bot uses name to type/search
        dept: tr.querySelector('.input-dept').options[tr.querySelector('.input-dept').selectedIndex].text, // Bot types name
        category: tr.querySelector('.input-cat').value, // Bot types name
        summary: tr.querySelector('.input-summary').value,
        message: tr.querySelector('.input-message').value,
        attendant: tr.querySelector('.input-attendant').options[tr.querySelector('.input-attendant').selectedIndex].text // Bot types name
    }));

    // Validate
    if (tickets.some(t => !t.client || !t.dept || !t.summary)) {
        alert('Por favor, preencha Cliente, Departamento e Resumo para todas as linhas.');
        return;
    }

    const credentials = {
        account: localStorage.getItem('tomticketAccount'),
        email: localStorage.getItem('tomticketEmail'),
        password: localStorage.getItem('tomticketPassword'),
        browser: localStorage.getItem('tomticketBrowser')
    };

    log('Iniciando robô...');
    const result = await window.electronAPI.runBot(tickets, credentials);
    // ... (rest of bot handling logic)
    // We need to trigger the same HandleResult logic as before or duplicate it.
    // Let's duplicate/inline the feedback logic for clarity since I'm rewriting the handler.

    log(`Resultado Bot: ${result.message}`);
    if (result.details) {
        result.details.forEach(item => {
            const tr = document.querySelector(`tr[data-id="${item.id}"]`);
            if (tr) {
                if (item.status === 'Success') {
                    tr.style.backgroundColor = '#d1e7dd';
                    tr.querySelectorAll('input, select').forEach(el => {
                        el.disabled = true; el.style.color = '#000';
                    });
                } else {
                    tr.style.backgroundColor = '#f8d7da';
                }
            }
        });
    }
});

// Helper para delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    const isTurbo = localStorage.getItem('turboMode') === 'true';
    if (!isTurbo) {
        log(`⚠️ Nota: Para evitar erros de limite (429), haverá uma pausa entre as requisições.`);
    }

    for (let i = 0; i < rowsToProcess.length; i++) {
        const tr = rowsToProcess[i];
        const summary = tr.querySelector('.input-summary').value;
        const messageInput = tr.querySelector('.input-message');

        if (!summary) continue;

        messageInput.value = "Gerando...";

        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
            try {
                // Recuperar chave da API da UI/Storage
                const apiKey = localStorage.getItem('geminiApiKey') || document.getElementById('geminiApiKey').value;
                const clientName = tr.querySelector('.input-client').value || "Cliente";

                // Chamar API Electron (Processo Principal)
                const aiResponse = await window.electronAPI.generateAI(summary, clientName, apiKey);

                try {
                    const aiData = JSON.parse(aiResponse);
                    if (aiData.descricao) messageInput.value = aiData.descricao;
                    log(`✅ IA gerou texto para linha ${tr.dataset.id}`);
                } catch (parseError) {
                    console.warn("Falha ao processar JSON da IA, usando texto bruto.", parseError);
                    messageInput.value = aiResponse; // Fallback
                }
                success = true;

                // Delay entre requisições
                // Turbo Mode logic
                const isTurbo = localStorage.getItem('turboMode') === 'true';

                // Feedback visual para o usuário saber se o Turbo pegou
                if (i === 0 && attempts === 0) {
                    log(isTurbo ? "🚀 MODO TURBO ATIVO (Sem delay)" : "🐢 MODO GRÁTIS ATIVO (Delay de segurança)");
                }

                if (success && i < rowsToProcess.length - 1) {
                    if (isTurbo) {
                        const waitTime = 100; // Minimal delay
                        log(`⚡ Turbo Mode: Próxima requisição em ${waitTime}ms...`);
                        await sleep(waitTime);
                    } else {
                        const waitTime = 2000;
                        log(`🐢 Modo Grátis: Aguardando ${waitTime / 1000}s para a próxima...`);
                        await sleep(waitTime);
                    }
                }

            } catch (error) {
                console.warn(error);
                const errorStr = error.toString();

                if (errorStr.includes('429') || errorStr.includes('Too Many Requests') || errorStr.includes('Quota exceeded')) {
                    attempts++;
                    log(`⚠️ Limite da API atingido (429). Aguardando 60s antes de tentar novamente (Tentativa ${attempts}/3)...`);
                    messageInput.value = `Aguardando (429)... ${attempts}/3`;
                    await sleep(62000); // Wait 62 seconds to be safe
                } else {
                    messageInput.value = "Erro na IA";
                    log(`❌ Erro na IA linha ${tr.dataset.id}: ${error.message}`);
                    break; // Non-retryable error
                }
            }
        }

        if (!success && attempts >= 3) {
            messageInput.value = "Falha (Limite)";
            log(`❌ Falha na linha ${tr.dataset.id} após 3 tentativas.`);
        }
    }

    log('Processamento de IA finalizado.');
});

// Lógica de Início do Bot
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
        let allCats = []; // Array of objects {id, name, department_id}
        let seenCatIds = new Set();
        let count = 0;
        const total = window.fullDepartments.length;

        const batchSize = 3;
        for (let i = 0; i < total; i += batchSize) {
            const batch = window.fullDepartments.slice(i, i + batchSize);

            await Promise.all(batch.map(async (dep) => {
                try {
                    // FIX: Must use 'department_id' to match main.js expectation
                    const catResult = await window.electronAPI.tomticketApi(token, 'categories', { department_id: dep.id });
                    if (catResult.success && catResult.data) {
                        catResult.data.forEach(c => {
                            if (!seenCatIds.has(c.id)) {
                                allCats.push(c);
                                seenCatIds.add(c.id);
                            }
                        });
                    }
                } catch (err) {
                    console.error(`Falha ao buscar categorias do depto ${dep.id}`, err);
                }
            }));

            count += batch.length;
            const btnSave = document.getElementById('btn-save-settings');
            if (btnSave) {
                btnSave.innerHTML = `<span class="spinner"></span> Sincronizando... (${Math.min(count, total)}/${total})`;
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // Cache full objects for ID lookup
        window.fullCategories = allCats;
        localStorage.setItem('cachedFullCategories', JSON.stringify(allCats));

        // Update Global CATEGORIES (Names only for UI Datalist/Select compatibility if other parts use it)
        CATEGORIES = allCats.map(c => c.name).sort();
        localStorage.setItem('cachedCategories', JSON.stringify(CATEGORIES));

        log(`Categorias atualizadas: ${allCats.length}`);
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

    // FIX: Usar ID no value para departamentos se window.fullDepartments existir
    let deptOptions;
    if (window.fullDepartments && window.fullDepartments.length > 0) {
        deptOptions = `<option value="">Selecione...</option>` + window.fullDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    } else {
        // Fallback (não ideal, mas previne crash)
        deptOptions = `<option value="">Selecione...</option>` + DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    }

    const catOptions = `<option value="">Selecione...</option>` + CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    const clientOptions = `<option value="">Selecione...</option>` + CUSTOMERS.map(c => `<option value="${c}">${c}</option>`).join('');

    // Operadores usam ID
    let operatorOptions;
    if (OPERATORS && OPERATORS.length > 0) {
        operatorOptions = `<option value="">Selecione...</option>` + OPERATORS.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    } else {
        operatorOptions = `<option value="">Selecione...</option>`;
    }

    // Helper segura para atualizar e manter valor
    const updateSelect = (select, opts) => {
        const keptValue = select.value;
        select.innerHTML = opts;
        // Tenta manter o valor se ele ainda fizer sentido, senão reseta.
        // Como mudamos para ID no dept, valores antigos (nomes) vão se perder, o que é CORRETO para forçar re-seleção válida.
        select.value = keptValue;
    };

    deptRows.forEach(select => updateSelect(select, deptOptions));
    catRows.forEach(select => updateSelect(select, catOptions));
    clientRows.forEach(select => updateSelect(select, clientOptions));
    attendantRows.forEach(select => updateSelect(select, operatorOptions));
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

    // Save Turbo Mode
    const chkTurbo = document.getElementById('chk-turbo-mode');
    localStorage.setItem('turboMode', chkTurbo ? chkTurbo.checked : false);

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

    const result = await window.electronAPI.tomticketApi(token, 'list_tickets');

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
