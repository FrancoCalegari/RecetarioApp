/* ═══════════════════════════════════════════════════════════════════
   Toast Notification System
   ═══════════════════════════════════════════════════════════════════ */

let container = null;

function ensureContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification
 * @param {string} message - Toast message text
 * @param {string} type - 'success' | 'error' | 'info'
 * @param {number} duration - Time in ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 3000) {
  const parent = ensureContainer();

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

  parent.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  }, duration);

  // Click to dismiss
  toast.addEventListener('click', () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  });
}
