/* ═══════════════════════════════════════════════════════════════════
   Login / Register View — Combined auth page
   ═══════════════════════════════════════════════════════════════════ */

import { apiLogin, apiRegister } from '../lib/api.js';
import { setSession } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';

function bindLogin() {
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    try {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) throw new Error('Completá todos los campos');

      const { token, user } = await apiLogin({ username, password });
      setSession(token, user);
      showToast(`¡Bienvenido, ${user.username}! 👋`, 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
}

function bindRegister() {
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    try {
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;

      if (!username || !email || !password) throw new Error('Completá todos los campos');
      if (password !== confirm) throw new Error('Las contraseñas no coinciden');
      if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

      const { token, user } = await apiRegister({ username, email, password });
      setSession(token, user);
      showToast(`¡Cuenta creada! Bienvenido, ${user.username} 🎉`, 'success');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
  });
}

function bindTabs() {
  document.getElementById('tab-login')?.addEventListener('click', () => showTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => showTab('register'));
}

function showTab(tab) {
  const loginPanel = document.getElementById('panel-login');
  const regPanel   = document.getElementById('panel-register');
  const tabLogin   = document.getElementById('tab-login');
  const tabReg     = document.getElementById('tab-register');

  if (tab === 'login') {
    loginPanel.classList.remove('hidden');
    regPanel.classList.add('hidden');
    tabLogin.classList.add('auth-tab-active');
    tabReg.classList.remove('auth-tab-active');
  } else {
    loginPanel.classList.add('hidden');
    regPanel.classList.remove('hidden');
    tabLogin.classList.remove('auth-tab-active');
    tabReg.classList.add('auth-tab-active');
  }
}

export async function renderLogin({ tab = 'login' } = {}) {
  setTimeout(() => {
    bindTabs();
    bindLogin();
    bindRegister();
    if (tab === 'register') showTab('register');
  }, 50);

  return `
    <div class="auth-container">
      <!-- Logo -->
      <div class="auth-logo">
        <img src="/icons/icon.svg" alt="Recetario" width="72" height="72" />
        <h1 class="heading-xl" style="margin-top: var(--space-md);">Recetario</h1>
        <p class="text-secondary">Tu recetario y planificador personal</p>
      </div>

      <!-- Tabs -->
      <div class="auth-tabs">
        <button class="auth-tab auth-tab-active" id="tab-login">Ingresar</button>
        <button class="auth-tab" id="tab-register">Registrarse</button>
      </div>

      <!-- Login Panel -->
      <div id="panel-login">
        <form id="login-form" class="flex flex-col gap-md">
          <div class="form-group">
            <label class="form-label">Usuario o email</label>
            <input type="text" class="form-input" id="login-username" placeholder="franco123" autocomplete="username" />
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <div class="password-wrapper">
              <input type="password" class="form-input" id="login-password" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="btn-show-pass" onclick="togglePass('login-password', this)">👁</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary w-full" id="btn-login" style="margin-top:8px;">Ingresar</button>
          <p class="text-sm text-muted" style="text-align:center;">
            ¿No tenés cuenta? <button type="button" class="link-btn" onclick="document.getElementById('tab-register').click()">Registrate</button>
          </p>
        </form>
      </div>

      <!-- Register Panel -->
      <div id="panel-register" class="hidden">
        <form id="register-form" class="flex flex-col gap-md">
          <div class="form-group">
            <label class="form-label">Nombre de usuario *</label>
            <input type="text" class="form-input" id="reg-username" placeholder="franco123" autocomplete="username" />
          </div>
          <div class="form-group">
            <label class="form-label">Email *</label>
            <input type="email" class="form-input" id="reg-email" placeholder="franco@email.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña *</label>
            <div class="password-wrapper">
              <input type="password" class="form-input" id="reg-password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
              <button type="button" class="btn-show-pass" onclick="togglePass('reg-password', this)">👁</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmar contraseña *</label>
            <input type="password" class="form-input" id="reg-confirm" placeholder="••••••••" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-accent w-full" id="btn-register" style="margin-top:8px;">Crear cuenta</button>
          <p class="text-sm text-muted" style="text-align:center;">
            ¿Ya tenés cuenta? <button type="button" class="link-btn" onclick="document.getElementById('tab-login').click()">Ingresá</button>
          </p>
        </form>
      </div>
    </div>
  `;
}

// Global helper for password toggle
window.togglePass = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
};
