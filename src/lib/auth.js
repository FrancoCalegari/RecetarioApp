/* ═══════════════════════════════════════════════════════════════════
   Auth Store — Current user session management
   ═══════════════════════════════════════════════════════════════════ */

const TOKEN_KEY = 'recetario_token';
const USER_KEY  = 'recetario_user';

let _user = null;
let _token = null;

// ─── Init from localStorage ──────────────────────────────────────
function init() {
  try {
    _token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    _user = raw ? JSON.parse(raw) : null;
  } catch {
    _user = null;
    _token = null;
  }
}
init();

// ─── Getters ─────────────────────────────────────────────────────
export function getToken() { return _token; }
export function getUser()  { return _user; }
export function isLoggedIn() { return !!_token && !!_user; }

// ─── Set session after login/register ────────────────────────────
export function setSession(token, user) {
  _token = token;
  _user  = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ─── Update user data (profile edits) ────────────────────────────
export function updateUser(data) {
  _user = { ..._user, ...data };
  localStorage.setItem(USER_KEY, JSON.stringify(_user));
}

// ─── Clear session on logout ──────────────────────────────────────
export function clearSession() {
  _user  = null;
  _token = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── Auth fetch helper — adds Bearer token header ─────────────────
export async function authFetch(url, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    clearSession();
    window.location.hash = '/login';
    throw new Error('Sesión expirada. Por favor ingresá de nuevo.');
  }
  return res;
}

// ─── Avatar URL helper ────────────────────────────────────────────
export function getAvatarUrl(avatarFileId, username = '?') {
  if (avatarFileId) return `/api/storage/files/${avatarFileId}`;
  return null; // Will show initial avatar in UI
}

// ─── Get user initial (for avatar placeholder) ────────────────────
export function getUserInitial(username) {
  return (username || '?')[0].toUpperCase();
}
