/**
 * Confirm Dialog Controller using HTML5 <dialog>
 * Accepts an optional documentRef for testability (defaults to global document).
 */

let confirmDialog = null;
let _docRef = null;

function getDoc() {
  return _docRef || (typeof document !== "undefined" ? document : null);
}

function initConfirmDialog(documentRef) {
  _docRef = documentRef || _docRef;
  const doc = getDoc();

  if (confirmDialog || !doc) return;

  confirmDialog = doc.createElement("dialog");
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

  doc.body.appendChild(confirmDialog);

  // Close on overlay click
  confirmDialog.addEventListener("click", (e) => {
    if (e.target === confirmDialog) {
      confirmDialog.close("cancel");
    }
  });
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmText="Confirmar"]
 * @param {string} [options.cancelText="Cancelar"]
 * @param {string} [options.confirmClass="primary"] - Use "danger" for destructive actions
 * @param {Document} [options.documentRef] - Optional document reference for testability
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog({
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmClass = "primary",
  documentRef,
} = {}) {
  initConfirmDialog(documentRef);

  const doc = getDoc();
  if (!doc || !confirmDialog) {
    console.warn("[confirm-modal] dialog not available — defaulting to true");
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    doc.getElementById("confirm-title").innerText = title;
    doc.getElementById("confirm-message").innerText = message;

    const btnCancel = doc.getElementById("btn-confirm-cancel");
    const btnOk = doc.getElementById("btn-confirm-ok");

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
