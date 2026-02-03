const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startBot: (tickets) => ipcRenderer.invoke('start-bot', tickets),
    generateAI: (summary) => ipcRenderer.invoke('generate-ai', summary),
    // Add more API methods here as needed
});
