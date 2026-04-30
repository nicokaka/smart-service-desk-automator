/**
 * Toast and Snackbar Notification System
 */

const MAX_TOASTS = 3;

/**
 * Creates and shows a toast notification.
 * @param {object} options
 * @param {string} options.message - The message to display
 * @param {'success'|'warning'|'error'|'info'} options.type - The type of toast
 * @param {number} [options.duration] - Auto-dismiss duration in ms. If not provided, defaults based on type.
 */
export function showToast({ message, type = "info", duration }) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "warning") icon = "⚠️";
  if (type === "error") icon = "❌";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  // Enforce Max Toasts
  const allToasts = container.querySelectorAll(".toast");
  if (allToasts.length > MAX_TOASTS) {
    allToasts[0].remove();
  }

  // Animation delay for layout
  requestAnimationFrame(() => {
    toast.classList.add("toast-visible");
  });

  const closeBtn = toast.querySelector(".toast-close");
  
  const dismiss = () => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300); // Wait for transition
  };

  closeBtn.addEventListener("click", dismiss);

  // Auto dismiss
  let autoDismissDuration = duration;
  if (autoDismissDuration === undefined) {
    switch (type) {
      case "success":
        autoDismissDuration = 4000;
        break;
      case "warning":
        autoDismissDuration = 6000;
        break;
      case "error":
        autoDismissDuration = 0; // default no auto dismiss for error
        break;
      case "info":
      default:
        autoDismissDuration = 4000;
        break;
    }
  }

  if (autoDismissDuration > 0) {
    setTimeout(dismiss, autoDismissDuration);
  }
}

export const toast = {
  success: (message, duration) => showToast({ message, type: "success", duration }),
  warning: (message, duration) => showToast({ message, type: "warning", duration }),
  error: (message, duration) => showToast({ message, type: "error", duration }),
  info: (message, duration) => showToast({ message, type: "info", duration }),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
