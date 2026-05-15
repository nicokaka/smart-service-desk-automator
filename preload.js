const { contextBridge, ipcRenderer } = require("electron");
const sharedDomain = require("./shared/domain.js");

contextBridge.exposeInMainWorld("sharedDomain", sharedDomain);

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
    cancel: () => ipcRenderer.invoke("tickets:cancel"),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("tickets:progress", handler);
      return handler;
    },
    removeProgressListener: (handler) => {
      if (handler) {
        ipcRenderer.removeListener("tickets:progress", handler);
      } else {
        ipcRenderer.removeAllListeners("tickets:progress");
      }
    },
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
