/* ═══════════════════════════════════════════════════════════════════
   Modal Component
   ═══════════════════════════════════════════════════════════════════ */

let activeModal = null;

/**
 * Open a modal with title and content
 * @param {Object} opts - { title, content, onClose }
 */
export function openModal({ title, content, onClose }) {
  closeModal(); // Close any existing modal

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.addEventListener('click', () => closeModal());

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modal-container';
  modal.addEventListener('click', (e) => e.stopPropagation());

  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <h2 class="modal-title">${title}</h2>
      <button class="btn btn-ghost btn-icon" onclick="document.dispatchEvent(new Event('close-modal'))" id="modal-close-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body" id="modal-body">${content}</div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  activeModal = { backdrop, modal, onClose };

  const closeHandler = () => closeModal();
  document.addEventListener('close-modal', closeHandler, { once: true });
}

/**
 * Close the active modal
 */
export function closeModal() {
  if (!activeModal) return;

  const { backdrop, modal, onClose } = activeModal;

  // Animate out
  backdrop.style.animation = `fadeOut var(--duration-normal) var(--ease-out) forwards`;
  modal.style.animation = `slideDown var(--duration-normal) var(--ease-out) forwards`;

  setTimeout(() => {
    backdrop.remove();
    modal.remove();
    document.body.style.overflow = '';
    if (onClose) onClose();
  }, 250);

  activeModal = null;
}

/**
 * Update modal body content
 */
export function updateModalContent(html) {
  const body = document.getElementById('modal-body');
  if (body) body.innerHTML = html;
}
