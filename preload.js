const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startBot: (tickets, credentials) => ipcRenderer.invoke('start-bot', tickets, credentials),
    generateAI: (descricao, cliente, apiKey, customPrompt, model) =>
        ipcRenderer.invoke(
            "generate-ai",
            descricao,
            cliente,
            apiKey,
            customPrompt,
            model
        ),
    generateSolutionAI: (title, description, client, apiKey, customPrompt, model) =>
        ipcRenderer.invoke(
            "generate-solution-ai",
            title,
            description,
            client,
            apiKey,
            customPrompt,
            model
        ), closeTickets: (tickets, credentials) => ipcRenderer.invoke('close-tickets', tickets, credentials),
    tomticketApi: (token, type, params) => ipcRenderer.invoke('tomticket-api-call', token, type, params),
    // Adicione mais métodos de API aqui conforme necessário
});
