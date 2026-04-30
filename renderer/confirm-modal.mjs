/**
 * Confirm Dialog Controller using HTML5 <dialog>
 */

let confirmDialog = null;

function initConfirmDialog() {
  if (confirmDialog) return;

  confirmDialog = document.createElement("dialog");
  confirmDialog.id = "confirm-dialog";
  confirmDialog.className = "confirm-modal";

  confirmDialog.innerHTML = `
    <div class="confirm-modal-content">
      <h3 id="confirm-title" class="confirm-title">Confirmar</h3>
      <p id="confirm-message" class="confirm-message">Tem certeza?</p>
      <div class="confirm-actions">
        <button id="btn-confirm-cancel" class="btn secondary">Cancelar</button>
        <button id="btn-confirm-ok" class="btn primary">Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(confirmDialog);

  // Close on overlay click
  confirmDialog.addEventListener("click", (e) => {
    if (e.target === confirmDialog) {
      // confirmDialog.close() passes empty string by default
      confirmDialog.close("cancel");
    }
  });
}

/**
 * 
 * @param {object} options 
 * @param {string} options.title 
 * @param {string} options.message 
 * @param {string} [options.confirmText="Confirmar"] 
 * @param {string} [options.cancelText="Cancelar"] 
 * @param {string} [options.confirmClass="primary"] - Option to use "danger" for destructive actions
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog({ 
  title, 
  message, 
  confirmText = "Confirmar", 
  cancelText = "Cancelar",
  confirmClass = "primary"
}) {
  initConfirmDialog();

  return new Promise((resolve) => {
    document.getElementById("confirm-title").innerText = title;
    document.getElementById("confirm-message").innerText = message;
    
    const btnCancel = document.getElementById("btn-confirm-cancel");
    const btnOk = document.getElementById("btn-confirm-ok");

    btnCancel.innerText = cancelText;
    btnOk.innerText = confirmText;
    
    // Reset classes
    btnOk.className = `btn ${confirmClass}`;

    const cleanup = () => {
      btnCancel.removeEventListener("click", onCancel);
      btnOk.removeEventListener("click", onOk);
      confirmDialog.removeEventListener("close", onClose);
    };

    const onCancel = () => {
      confirmDialog.close("cancel");
    };

    const onOk = () => {
      confirmDialog.close("ok");
    };

    const onClose = () => {
      cleanup();
      resolve(confirmDialog.returnValue === "ok");
    };

    btnCancel.addEventListener("click", onCancel);
    btnOk.addEventListener("click", onOk);
    confirmDialog.addEventListener("close", onClose);

    confirmDialog.showModal();
  });
}
