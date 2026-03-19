const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  settings: {
    load: () => ipcRenderer.invoke("settings:load"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings),
  },
  catalog: {
    sync: (overrides) => ipcRenderer.invoke("catalog:sync", overrides),
  },
  tickets: {
    list: (overrides) => ipcRenderer.invoke("tickets:list", overrides),
    create: (rows, context) => ipcRenderer.invoke("tickets:create", rows, context),
    close: (tickets, overrides) =>
      ipcRenderer.invoke("tickets:close", tickets, overrides),
  },
  ai: {
    generateTicket: (payload) => ipcRenderer.invoke("ai:generate-ticket", payload),
    generateSolution: (payload) =>
      ipcRenderer.invoke("ai:generate-solution", payload),
  },
  external: {
    open: (url) => ipcRenderer.invoke("shell:open-external", url),
  },
});
