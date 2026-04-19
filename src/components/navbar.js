/* ═══════════════════════════════════════════════════════════════════
   Bottom Navigation Component
   ═══════════════════════════════════════════════════════════════════ */

import { isLoggedIn, getUser, getUserInitial, getAvatarUrl } from '../lib/auth.js';

const NAV_ITEMS = [
  {
    route: '/',
    label: 'Inicio',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  },
  {
    route: '/recetas',
    label: 'Recetas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  },
  {
    route: '/receti',
    label: 'Receti IA',
    isReceti: true,
    icon: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none"><circle cx="12" cy="12" r="12" fill="url(#ng)"/><defs><linearGradient id="ng" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stop-color="#E8734A"/><stop offset="100%" stop-color="#4CAF7D"/></linearGradient></defs><rect x="7" y="10" width="10" height="8" rx="2" fill="#0F1419"/><rect x="8" y="11.5" width="3" height="2" rx="0.5" fill="#4CAF7D"/><rect x="13" y="11.5" width="3" height="2" rx="0.5" fill="#4CAF7D"/><rect x="9" y="15" width="6" height="1.5" rx="0.75" fill="#E8734A"/><ellipse cx="12" cy="9" rx="5" ry="2" fill="#0F1419"/><ellipse cx="12" cy="8" rx="3" ry="2" fill="#0F1419"/><line x1="12" y1="6" x2="12" y2="4" stroke="#0F1419" stroke-width="1.5"/><circle cx="12" cy="3" r="1" fill="#E8734A"/></svg>`,
  },
  {
    route: '/planificador',
    label: 'Plan',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  },
  {
    route: '/perfil',
    label: 'Perfil',
    isProfile: true,
  },
];

function renderProfileIcon() {
  if (!isLoggedIn()) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  const user = getUser();
  const url = getAvatarUrl(user.avatar_file_id);
  if (url) {
    return `<img src="${url}" width="26" height="26" style="border-radius:50%; object-fit:cover; border:2px solid var(--primary);" />`;
  }
  return `<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;">${getUserInitial(user.username)}</div>`;
}

export function renderNavbar() {
  const currentHash = window.location.hash || '#/';

  const items = NAV_ITEMS.map(({ route, label, icon, isProfile, isReceti }) => {
    const isActive = currentHash === `#${route}` ||
      (route !== '/' && currentHash.startsWith(`#${route}`));

    const finalRoute = isProfile && !isLoggedIn() ? '/login' : route;
    const iconHtml = isProfile ? renderProfileIcon() : icon;

    const extraStyle = isReceti
      ? 'position:relative;'
      : '';

    const recitiGlow = isReceti && isActive
      ? `<span class="receti-nav-glow"></span>`
      : '';

    return `
      <button class="nav-item ${isActive ? 'active' : ''} ${isReceti ? 'nav-item-receti' : ''}"
              data-route="${route}"
              onclick="window.location.hash='${finalRoute}'"
              id="nav-${label.toLowerCase().replace(/\s+/g, '-')}"
              style="${extraStyle}">
        ${recitiGlow}
        ${iconHtml}
        <span>${isProfile && isLoggedIn() ? getUser().username.split(' ')[0] : label}</span>
        ${isReceti ? '' : ''}
      </button>
    `;
  }).join('');

  return `
    <nav class="bottom-nav" id="main-nav">
      ${items}
      <div id="offline-queue-badge" class="offline-queue-badge" style="display:none;">0</div>
    </nav>`;
}
