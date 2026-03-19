import { $$, bindTabs, createLogger } from "./common.mjs";
import { initAboutModal } from "./modal-controller.mjs";
import { createManagerController } from "./manager-controller.mjs";
import { createQueueController } from "./queue-controller.mjs";
import { createSettingsController } from "./settings-controller.mjs";

let appInitialized = false;

export async function initApp() {
  if (appInitialized) {
    return;
  }

  appInitialized = true;
  const electronAPI = window.electronAPI;
  const log = createLogger(document.getElementById("logs-output"));

  bindTabs($$(".nav-item"), $$(".tab-content"));

  const queueController = createQueueController({
    electronAPI,
    log,
  });

  const settingsController = createSettingsController({
    electronAPI,
    log,
    queueController,
  });

  const managerController = createManagerController({
    electronAPI,
    log,
  });

  await settingsController.init();
  queueController.init();
  managerController.init();
  initAboutModal(document, electronAPI);

  const clearLogsButton = document.getElementById("btn-clear-logs");
  const logsOutput = document.getElementById("logs-output");
  if (clearLogsButton && clearLogsButton.dataset.bound !== "true") {
    clearLogsButton.dataset.bound = "true";
    clearLogsButton.addEventListener("click", () => {
      if (logsOutput) {
        logsOutput.innerHTML =
          '<div class="log-entry info">[System] Logs limpos.</div>';
      }
    });
  }
}
