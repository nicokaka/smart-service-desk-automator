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
        const { getDepartments, getCategories, getCustomers, createTicket, linkAttendant, getTickets } = require('./tomticket_api');

        if (type === 'departments') {
            const data = await getDepartments(token);
            return { success: true, data };
        }

        if (type === 'categories') {
            const data = await getCategories(token, params.department_id);
            return { success: true, data };
        }

        if (type === 'customers') {
            const data = await getCustomers(token);
            return { success: true, data };
        }

        if (type === 'create_ticket') {
            const data = await createTicket(token, params);
            return { success: true, data };
        }

        if (type === 'link_attendant') {
            const data = await linkAttendant(token, params.ticket_id, params.operator_id);
            return { success: true, data };
        }

        if (type === 'list_tickets') {
            // Fallback for list tickets
            const data = await getTickets(token);
            return { success: true, data };
        }

        if (type === 'operators') {
            const { getOperators } = require('./tomticket_api');
            const data = await getOperators(token);
            return { success: true, data };
        }

        throw new Error(`Unknown API call type: ${type}`);
    } catch (error) {
        console.error('API Call Failed:', error);
        return { success: false, message: (error.response && error.response.data && error.response.data.message) || error.message };
    }
});
