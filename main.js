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

// --- IPC Handlers ---

// Handler for "Start Cloud/Bot"
ipcMain.handle('start-bot', async (event, tickets) => {
    console.log('Received tickets to process:', tickets);

    // Simulation of processing
    try {
        const result = await runBot(tickets, { browser: 'chromium' }); // Pass credentials here if we had them
        return result;
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// Handler for "Generate AI Message" (Mock)
ipcMain.handle('generate-ai', async (event, summary) => {
    // Mock AI response
    return `[AI Generated] Prezado cliente, referente ao problema "${summary}", estamos analisando...`;
});
