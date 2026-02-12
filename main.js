const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { runBot } = require('./bot');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Security best practice
            contextIsolation: true  // Security best practice
        }
    });

    win.loadFile('index.html');
    // win.webContents.openDevTools(); // Open DevTools for debugging
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- Manipuladores IPC ---

// Manipulador para "Iniciar Nuvem/Bot"
ipcMain.handle('start-bot', async (event, tickets, credentials) => {
    console.log('Received tickets to process:', tickets);
    console.log('Received credentials:', { ...credentials, password: '***' });

    // Simulação de processamento
    try {
        const result = await runBot(tickets, credentials);
        return result;
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// Manipulador para "Gerar Mensagem com IA" (Mock)
const { generateTicketMessage } = require('./ai_service');
const { getTickets } = require('./tomticket_api');

// Manipulador para "Gerar Mensagem com IA"
ipcMain.handle('generate-ai', async (event, summary, clientName, apiKey) => {
    return await generateTicketMessage(summary, clientName, apiKey);
});

// Manipulador para "Gerar Solução com IA"
ipcMain.handle('generate-solution-ai', async (event, title, description, clientName, apiKey) => {
    const { generateSolutionMessage } = require('./ai_service');
    return await generateSolutionMessage(title, description, clientName, apiKey);
});

// Manipulador para "Fechar Chamados"
// Manipulador para "Fechar Chamados" (Via API Direta)
ipcMain.handle('close-tickets', async (event, tickets, credentials) => {
    const { finalizeTicket } = require('./tomticket_api');
    const token = credentials.token;

    if (!token) {
        return { success: false, message: "Token de API não fornecido para fechamento." };
    }

    const results = [];
    console.log(`Iniciando fechamento de ${tickets.length} chamados via API...`);

    for (const ticket of tickets) {
        try {
            console.log(`Finalizing ticket ${ticket.id} via API...`);
            await finalizeTicket(token, ticket.id, ticket.solution);
            results.push({ id: ticket.id, status: 'Success', message: 'Chamado finalizado via API' });
        } catch (err) {
            console.error(`Failed to close ticket ${ticket.id}:`, err);
            const errorMsg = err.response && err.response.data && err.response.data.message ? err.response.data.message : err.message;
            results.push({ id: ticket.id, status: 'Error', message: errorMsg });
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
    }

    return { success: true, message: "Processamento concluído com API!", details: results };
});

// Manipulador para API do TomTicket
ipcMain.handle('tomticket-api-call', async (event, token, type, params) => {
    try {
        const { getDepartments, getCategories, getCustomers, createTicket } = require('./tomticket_api');

        if (type === 'departments') {
            console.log('Fetching Departments...');
            const data = await getDepartments(token);
            return { success: true, data };
        }

        if (type === 'categories') {
            console.log(`Fetching Categories for Department ${params.departmentId}...`);
            const data = await getCategories(token, params.departmentId);
            return { success: true, data };
        }

        if (type === 'customers') {
            console.log('Fetching Customers...');
            const data = await getCustomers(token);
            return { success: true, data };
        }

        if (type === 'create_ticket') {
            console.log('Creating Ticket...', params);
            const result = await createTicket(token, params);
            return { success: true, data: result };
        }

        if (type === 'operators') {
            console.log('Fetching Operators...');
            const { getOperators } = require('./tomticket_api');
            const data = await getOperators(token);
            return { success: true, data };
        }

        // Padrão: Listar Chamados
        console.log('Fetching tickets via API...');
        const response = await getTickets(token);
        return { success: true, data: response.data || response };

    } catch (e) {
        console.error('API Call Failed:', e);
        return { success: false, message: e.message };
    }
});
