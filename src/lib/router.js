/* ═══════════════════════════════════════════════════════════════════
   Hash-based SPA Router with animated transitions
   ═══════════════════════════════════════════════════════════════════ */

const routes = {};
let currentView = null;
let appContainer = null;

/**
 * Register a route handler
 */
export function route(path, handler) {
  routes[path] = handler;
}

/**
 * Navigate to a hash path
 */
export function navigate(path) {
  window.location.hash = path;
}

/**
 * Get current route params from hash
 * e.g. #/receta/5 with route /receta/:id → { id: '5' }
 */
function matchRoute(hash) {
  const path = hash.replace('#', '') || '/';

  // Exact match first
  if (routes[path]) return { handler: routes[path], params: {} };

  // Pattern matching
  for (const [pattern, handler] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].substring(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, params };
  }

  return null;
}

/**
 * Handle route change
 */
async function handleRoute() {
  const hash = window.location.hash || '#/';
  const matched = matchRoute(hash);

  if (!matched) {
    navigate('/');
    return;
  }

  const container = appContainer;
  if (!container) return;

  // Animate out current view
  if (currentView) {
    container.style.opacity = '0';
    container.style.transform = 'translateY(8px)';
    await new Promise((r) => setTimeout(r, 150));
  }

  // Render new view
  try {
    const html = await matched.handler(matched.params);
    container.innerHTML = `<div class="page">${html}</div>`;

    // Animate in
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    });

    currentView = hash;

    // Update navbar active state
    document.querySelectorAll('.nav-item').forEach((el) => {
      const href = el.getAttribute('data-route');
      el.classList.toggle('active', hash.startsWith(`#${href}`));
    });
  } catch (err) {
    console.error('Route error:', err);
    container.innerHTML = `
      <div class="page">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Error</div>
          <div class="empty-state-text">${err.message}</div>
        </div>
      </div>`;
  }
}

/**
 * Initialize the router
 */
export function initRouter(container) {
  appContainer = container;
  appContainer.style.transition = 'opacity 150ms ease, transform 150ms ease';

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

/**
 * Get current route path (without #)
 */
export function currentRoute() {
  return (window.location.hash || '#/').replace('#', '');
}
