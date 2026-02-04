const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startBot: (tickets, credentials) => ipcRenderer.invoke('start-bot', tickets, credentials),
    generateAI: (summary) => ipcRenderer.invoke('generate-ai', summary),
    tomticketApi: (token, type, params) => ipcRenderer.invoke('tomticket-api-call', token, type, params),
    // Add more API methods here as needed
});
