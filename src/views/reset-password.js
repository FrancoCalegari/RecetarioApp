/* ═══════════════════════════════════════════════════════════════════
   Reset Password View — Handles the link sent by email
   ═══════════════════════════════════════════════════════════════════ */

import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';

export async function renderResetPassword() {
  // Read token from URL query string (e.g. /#/reset-password?token=abc123)
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const token = params.get('token');

  // If no token in URL, show error state
  if (!token) {
    return `
      <div class="auth-container">
        <div class="auth-logo">
          <img src="/icons/icon.svg" alt="Recetario" width="72" height="72" />
          <h1 class="heading-xl" style="margin-top: var(--space-md);">Recetario</h1>
        </div>
        <div class="card" style="border-color: #E8734A; background: rgba(232,115,74,0.08);">
          <div class="card-body text-center">
            <div style="font-size:2.5rem; margin-bottom:var(--space-sm);">⚠️</div>
            <h2 class="heading-md mb-sm">Link inválido</h2>
            <p class="text-sm text-secondary mb-md">Este link de recuperación no es válido o ya fue utilizado.</p>
            <button class="btn btn-primary w-full" onclick="window.location.hash='/login'">
              Volver al login
            </button>
          </div>
        </div>
      </div>`;
  }

  setTimeout(() => {
    document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-reset');
      const newPassword = document.getElementById('reset-password').value;
      const confirmPassword = document.getElementById('reset-confirm').value;

      if (!newPassword || !confirmPassword) {
        return showToast('Completá ambos campos', 'error');
      }
      if (newPassword.length < 6) {
        return showToast('La contraseña debe tener al menos 6 caracteres', 'error');
      }
      if (newPassword !== confirmPassword) {
        return showToast('Las contraseñas no coinciden', 'error');
      }

      btn.disabled = true;
      btn.textContent = 'Guardando...';

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al restablecer la contraseña');

        showToast('¡Contraseña actualizada! Ingresá con tu nueva clave 🎉', 'success');

        // Clean token from URL then redirect to login
        setTimeout(() => navigate('/login'), 1200);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Guardar nueva contraseña';
      }
    });
  }, 50);

  return `
    <div class="auth-container">
      <!-- Logo -->
      <div class="auth-logo">
        <img src="/icons/icon.svg" alt="Recetario" width="72" height="72" />
        <h1 class="heading-xl" style="margin-top: var(--space-md);">Nueva contraseña</h1>
        <p class="text-secondary">Elegí una contraseña segura para tu cuenta</p>
      </div>

      <div class="auth-tabs" style="justify-content:center; pointer-events:none;">
        <span style="color:var(--primary); font-weight:600; font-size:0.9rem;">🔑 Restablecer contraseña</span>
      </div>

      <form id="reset-form" class="flex flex-col gap-md">
        <div class="form-group">
          <label class="form-label">Nueva contraseña</label>
          <div class="password-wrapper">
            <input
              type="password"
              class="form-input"
              id="reset-password"
              placeholder="Mínimo 6 caracteres"
              autocomplete="new-password"
            />
            <button type="button" class="btn-show-pass" onclick="togglePass('reset-password', this)">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña</label>
          <div class="password-wrapper">
            <input
              type="password"
              class="form-input"
              id="reset-confirm"
              placeholder="Repetí la contraseña"
              autocomplete="new-password"
            />
            <button type="button" class="btn-show-pass" onclick="togglePass('reset-confirm', this)">👁</button>
          </div>
        </div>

        <button type="submit" class="btn btn-primary w-full" id="btn-reset" style="margin-top:8px;">
          🔒 Guardar nueva contraseña
        </button>
        <p class="text-sm text-muted" style="text-align:center;">
          <button type="button" class="link-btn" onclick="window.location.hash='/login'">Cancelar</button>
        </p>
      </form>
    </div>`;
}
