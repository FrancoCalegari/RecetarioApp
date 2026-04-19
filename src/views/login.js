/* ═══════════════════════════════════════════════════════════════════
   Login / Register View — Combined auth page
   ═══════════════════════════════════════════════════════════════════ */

import { apiLogin, apiRegister } from '../lib/api.js';
import { setSession } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';

async function apiForgotPassword(email) {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al enviar el correo');
  return data;
}

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

function bindForgotPassword() {
  document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-forgot');
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) return showToast('Ingresá tu email', 'error');

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      await apiForgotPassword(email);
      // Always show success to avoid email enumeration
      document.getElementById('forgot-success')?.classList.remove('hidden');
      document.getElementById('forgot-form-wrap')?.classList.add('hidden');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Enviar instrucciones';
    }
  });
}

function bindTabs() {
  document.getElementById('tab-login')?.addEventListener('click', () => showTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => showTab('register'));
}

function showTab(tab) {
  const loginPanel  = document.getElementById('panel-login');
  const regPanel    = document.getElementById('panel-register');
  const forgotPanel = document.getElementById('panel-forgot');
  const tabLogin    = document.getElementById('tab-login');
  const tabReg      = document.getElementById('tab-register');

  // Hide all panels
  [loginPanel, regPanel, forgotPanel].forEach((p) => p?.classList.add('hidden'));
  [tabLogin, tabReg].forEach((t) => t?.classList.remove('auth-tab-active'));

  if (tab === 'login') {
    loginPanel?.classList.remove('hidden');
    tabLogin?.classList.add('auth-tab-active');
  } else if (tab === 'register') {
    regPanel?.classList.remove('hidden');
    tabReg?.classList.add('auth-tab-active');
  } else if (tab === 'forgot') {
    forgotPanel?.classList.remove('hidden');
  }
}

export async function renderLogin({ tab = 'login' } = {}) {
  setTimeout(() => {
    bindTabs();
    bindLogin();
    bindRegister();
    bindForgotPassword();
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
          <div class="flex" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
            <p class="text-sm text-muted" style="margin:0;">
              ¿No tenés cuenta? <button type="button" class="link-btn" onclick="document.getElementById('tab-register').click()">Registrate</button>
            </p>
            <button type="button" class="link-btn text-sm" style="color:var(--text-muted);" onclick="window.dispatchEvent(new CustomEvent('show-forgot'))">¿Olvidaste tu contraseña?</button>
          </div>
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

      <!-- Forgot Password Panel -->
      <div id="panel-forgot" class="hidden">
        <div id="forgot-form-wrap">
          <p class="text-sm text-secondary mb-md">
            Ingresá tu email y te enviaremos un link para restablecer tu contraseña.
          </p>
          <form id="forgot-form" class="flex flex-col gap-md">
            <div class="form-group">
              <label class="form-label">Email de tu cuenta</label>
              <input type="email" class="form-input" id="forgot-email" placeholder="franco@email.com" autocomplete="email" />
            </div>
            <button type="submit" class="btn btn-primary w-full" id="btn-forgot">Enviar instrucciones</button>
            <p class="text-sm text-muted" style="text-align:center;">
              <button type="button" class="link-btn" onclick="window.dispatchEvent(new CustomEvent('show-login'))">Volver al login</button>
            </p>
          </form>
        </div>
        <!-- Success state -->
        <div id="forgot-success" class="hidden" style="text-align:center; padding: var(--space-lg) 0;">
          <div style="font-size:3rem; margin-bottom:var(--space-md);">📧</div>
          <h2 class="heading-md mb-sm">¡Email enviado!</h2>
          <p class="text-sm text-secondary mb-md">
            Si el email está registrado, recibirás un link para restablecer tu contraseña.<br>
            <span class="text-xs text-muted">Revisá también tu carpeta de spam.</span>
          </p>
          <button class="btn btn-ghost w-full" onclick="window.dispatchEvent(new CustomEvent('show-login'))">Volver al login</button>
        </div>
      </div>
    </div>
  `;
}

// Listen for show-forgot / show-login custom events (emitted by inline buttons)
window.addEventListener('show-forgot', () => {
  const fp = document.getElementById('panel-forgot');
  const lp = document.getElementById('panel-login');
  const rp = document.getElementById('panel-register');
  [lp, rp].forEach((p) => p?.classList.add('hidden'));
  fp?.classList.remove('hidden');
});
window.addEventListener('show-login', () => {
  const fp = document.getElementById('panel-forgot');
  const lp = document.getElementById('panel-login');
  fp?.classList.add('hidden');
  lp?.classList.remove('hidden');
  document.getElementById('tab-login')?.classList.add('auth-tab-active');
  document.getElementById('tab-register')?.classList.remove('auth-tab-active');
});

// Global helper for password toggle
window.togglePass = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
};
