const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const { runBot } = require("./bot");

// Fix para erro de GPU no Linux / Ambiente Virtual
app.disableHardwareAcceleration();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Security best practice
    },
  });

  win.loadFile("index.html");
  // win.webContents.openDevTools(); // Open DevTools for debugging

  // --- Zoom Controls ---
  // Ctrl+= ou Ctrl+Shift+= (Zoom In)
  win.webContents.on("before-input-event", (event, input) => {
    if (input.control && !input.alt) {
      if (input.key === "=" || input.key === "+") {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
        event.preventDefault();
      } else if (input.key === "-") {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
        event.preventDefault();
      } else if (input.key === "0") {
        win.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// --- Manipuladores IPC ---

// Manipulador para "Iniciar Nuvem/Bot"
ipcMain.handle("start-bot", async (event, tickets, credentials) => {
  try {
    return await runBot(tickets, credentials);
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Manipulador para "Fechar Chamados" (API com Fallback para Bot)
ipcMain.handle("close-tickets", async (event, tickets, credentials) => {
  try {
    const { finalizeTicket } = require("./tomticket_api");
    const { runBot } = require("./bot");
    const token = credentials.token;

    // Fallback: Se não tiver token, usa o robô (Playwright) via UI
    if (!token) {
      console.log('Token de API ausente. Realizando fallback para fechamento via Navegador (Bot)...');
      credentials.mode = 'close';
      return await runBot(tickets, credentials);
    }

    // Com token: Fechamento via API (Rápido e silencioso)
    console.log('Iniciando fechamento em lote via API...');
    const results = [];

    // Obter delay das configurações repassadas pela UI. Fallback: 2s
    const delaySeconds = credentials.delay ? parseInt(credentials.delay, 10) : 2;
    const isTurbo = credentials.turbo === true;
    const waitTime = isTurbo ? 100 : (delaySeconds * 1000);

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      console.log(`Closing ticket ID via API: ${ticket.id}`);
      try {
        await finalizeTicket(token, ticket.id, ticket.solution);
        results.push({ id: ticket.id, status: 'Success', message: 'Chamado finalizado via API' });
      } catch (err) {
        console.error(`Failed to close ticket ${ticket.id} via API:`, err);
        results.push({ id: ticket.id, status: 'Error', message: err.message });
      }

      // Delay de proteção apenas se não for o último 
      if (i < tickets.length - 1) {
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    return { success: true, message: "Lote processado via API!", details: results };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

const { generateTicketMessage, generateSolutionMessage } = require("./ai_service");
const { getTickets, getDepartments, getCategories, getCustomers, createTicket, linkAttendant, getOperators } = require("./tomticket_api");

// Manipulador para "Gerar Mensagem com IA"
ipcMain.handle(
  "generate-ai",
  async (event, summary, clientName, apiKey, customPrompt, model) => {
    return await generateTicketMessage(
      summary,
      clientName,
      apiKey,
      customPrompt,
      model,
    );
  },
);

// Manipulador para "Gerar Solução com IA"
ipcMain.handle(
  "generate-solution-ai",
  async (
    event,
    title,
    description,
    clientName,
    apiKey,
    customPrompt,
    model,
  ) => {
    return await generateSolutionMessage(
      title,
      description,
      clientName,
      apiKey,
      customPrompt,
      model,
    );
  },
);

// Manipulador para API do TomTicket
ipcMain.handle("tomticket-api-call", async (event, token, type, params) => {
  try {

    if (type === "departments") {
      const data = await getDepartments(token);
      return { success: true, data };
    }

    if (type === "categories") {
      const data = await getCategories(token, params.department_id);
      return { success: true, data };
    }

    if (type === "customers") {
      const data = await getCustomers(token);
      return { success: true, data };
    }

    if (type === "create_ticket") {
      const data = await createTicket(token, params);
      return { success: true, data };
    }

    if (type === "link_attendant") {
      const data = await linkAttendant(
        token,
        params.ticket_id,
        params.operator_id,
      );
      return { success: true, data };
    }

    if (type === "list_tickets") {
      // Fallback for list tickets
      const data = await getTickets(token);
      return { success: true, data };
    }

    if (type === "operators") {
      const { getOperators } = require("./tomticket_api");
      const data = await getOperators(token);
      return { success: true, data };
    }

    throw new Error(`Unknown API call type: ${type}`);
  } catch (error) {
    console.error("API Call Failed:", error);
    return {
      success: false,
      message:
        (error.response &&
          error.response.data &&
          error.response.data.message) ||
        error.message,
    };
  }
});
