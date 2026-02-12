const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startBot: (tickets, credentials) => ipcRenderer.invoke('start-bot', tickets, credentials),
    generateAI: (summary, clientName, apiKey) => ipcRenderer.invoke('generate-ai', summary, clientName, apiKey),
    generateSolutionAI: (title, description, clientName, apiKey) => ipcRenderer.invoke('generate-solution-ai', title, description, clientName, apiKey),
    closeTickets: (tickets, credentials) => ipcRenderer.invoke('close-tickets', tickets, credentials),
    tomticketApi: (token, type, params) => ipcRenderer.invoke('tomticket-api-call', token, type, params),
    // Adicione mais métodos de API aqui conforme necessário
});
