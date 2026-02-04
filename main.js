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
ipcMain.handle('generate-ai', async (event, summary) => {
    return await generateTicketMessage(summary);
});

// Manipulador para API do TomTicket
ipcMain.handle('tomticket-api-call', async (event, token, type, params) => {
    try {
        const { getDepartments, getCategories } = require('./tomticket_api');

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

        // Padrão: Listar Chamados
        console.log('Fetching tickets via API...');
        const response = await getTickets(token);
        return { success: true, data: response.data || response };

    } catch (e) {
        console.error('API Call Failed:', e);
        return { success: false, message: e.message };
    }
});
