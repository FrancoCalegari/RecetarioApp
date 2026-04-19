/* ═══════════════════════════════════════════════════════════════════
   RecetarioApp — Main Entry Point
   ═══════════════════════════════════════════════════════════════════ */

import { route, initRouter, navigate } from './lib/router.js';
import { initDB, migrateDB } from './lib/api.js';
import { renderNavbar } from './components/navbar.js';
import { isLoggedIn } from './lib/auth.js';
import { initIDB } from './lib/idb.js';
import { initOfflineSync, updateQueueBadge, processQueue } from './lib/offline-queue.js';
import { showToast } from './components/toast.js';

// ─── Views ──────────────────────────────────────────────────────────
import { renderHome } from './views/home.js';
import { renderRecetas } from './views/recetas.js';
import { renderRecetaDetalle } from './views/receta-detalle.js';
import { renderRecetaForm } from './views/receta-form.js';
import { renderPlanificador } from './views/planificador.js';
import { renderIngredientes } from './views/ingredientes.js';
import { renderLogin } from './views/login.js';
import { renderPerfil } from './views/perfil.js';
import { renderComunidadRecetas } from './views/comunidad-recetas.js';
import { renderComunidadIngredientes } from './views/comunidad-ingredientes.js';
import { renderReceti } from './views/receti.js';
import { renderResetPassword } from './views/reset-password.js';

// ─── Auth guard ──────────────────────────────────────────────────────
function guarded(fn) {
  return async (params) => {
    if (!isLoggedIn()) {
      navigate('/login');
      return '';
    }
    return fn(params);
  };
}

// ─── Routes ─────────────────────────────────────────────────────────
route('/', () => renderHome());
route('/recetas', () => renderRecetas());
route('/receta/nueva', guarded(() => renderRecetaForm({ id: 'nueva' })));
route('/receta/editar/:id', guarded((p) => renderRecetaForm(p)));
route('/receta/:id', (p) => renderRecetaDetalle(p));
route('/planificador', guarded(() => renderPlanificador()));
route('/ingredientes', () => renderIngredientes());
route('/login', () => renderLogin());
route('/registro', () => renderLogin({ tab: 'register' }));
route('/perfil', guarded(() => renderPerfil()));
route('/comunidad', () => renderComunidadRecetas());
route('/comunidad/ingredientes', () => renderComunidadIngredientes());
route('/receti', () => renderReceti());
route('/reset-password', () => renderResetPassword());

// ─── Navbar updater ──────────────────────────────────────────────────
function refreshNavbar() {
  const nav = document.getElementById('main-nav');
  if (nav) nav.outerHTML = renderNavbar();
}

// ─── SW Update Banner ────────────────────────────────────────────────
function showUpdateBanner() {
  const existing = document.getElementById('sw-update-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.innerHTML = `
    <span>✨ Nueva versión disponible</span>
    <button id="btn-sw-update">Actualizar ahora</button>
    <button id="btn-sw-dismiss" style="opacity:0.6; font-size:0.8rem;">Más tarde</button>
  `;
  document.body.prepend(banner);

  document.getElementById('btn-sw-update')?.addEventListener('click', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    banner.remove();
    window.location.reload();
  });

  document.getElementById('btn-sw-dismiss')?.addEventListener('click', () => {
    banner.remove();
  });
}

// ─── Service Worker Registration ─────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ SW registered:', reg.scope);

    // Detect new SW waiting
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version installed, old SW still controlling
          console.log('[App] New SW installed, showing update banner');
          showUpdateBanner();
        }
      });
    });

    // Listen for SW messages
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type } = event.data || {};

      if (type === 'SW_ACTIVATED') {
        console.log('[App] SW activated:', event.data.version);
      }

      if (type === 'PROCESS_QUEUE') {
        // Background sync requested by SW
        processQueue().then((results) => {
          if (results.synced > 0) {
            showToast(`✅ ${results.synced} receta${results.synced !== 1 ? 's' : ''} sincronizada${results.synced !== 1 ? 's' : ''}`, 'success');
          }
        });
      }
    });

    // Register background sync if supported
    if ('SyncManager' in window) {
      try {
        await reg.sync.register('sync-offline-queue');
      } catch (e) {
        console.log('Background sync not available:', e.message);
      }
    }

    // Check for updates periodically (every 30 min while app is open)
    setInterval(() => reg.update(), 30 * 60 * 1000);

  } catch (e) {
    console.warn('SW registration failed:', e);
  }
}

// ─── Offline sync callback ───────────────────────────────────────────
function setupOfflineCallbacks() {
  window.addEventListener('offline-synced', (e) => {
    const { synced } = e.detail;
    if (synced > 0) {
      showToast(`☁️ ${synced} item${synced !== 1 ? 's' : ''} sincronizado${synced !== 1 ? 's' : ''} con la nube`, 'success');
      // Reload current view to show fresh data
      const hash = window.location.hash;
      if (hash === '#/recetas' || hash === '#/ingredientes') {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  });
}

// ─── Initialize App ──────────────────────────────────────────────────
async function init() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div id="offline-status-bar" class="offline-status-bar" style="display:none;"></div>
    <main id="router-outlet"></main>
    ${renderNavbar()}
  `;

  const outlet = document.getElementById('router-outlet');
  initRouter(outlet);

  window.addEventListener('hashchange', refreshNavbar);

  // Init IndexedDB first (needed for offline + queue)
  await initIDB();

  // Start offline sync watcher
  initOfflineSync();
  setupOfflineCallbacks();

  // Register SW
  await registerSW();

  // Init + migrate DB in background (non-blocking)
  initDB()
    .then(() => migrateDB())
    .then(() => console.log('✅ DB ready'))
    .catch((e) => console.warn('DB setup skipped:', e.message));
}

// ─── Boot ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
