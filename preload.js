const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startBot: (tickets, credentials) => ipcRenderer.invoke('start-bot', tickets, credentials),
    generateAI: (summary, apiKey) => ipcRenderer.invoke('generate-ai', summary, apiKey),
    tomticketApi: (token, type, params) => ipcRenderer.invoke('tomticket-api-call', token, type, params),
    // Adicione mais métodos de API aqui conforme necessário
});
