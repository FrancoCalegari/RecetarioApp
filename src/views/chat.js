/* ═══════════════════════════════════════════════════════════════════
   Chat View — Sistema de chat entre usuarios
   ═══════════════════════════════════════════════════════════════════ */

import { authFetch, getUser, getAvatarUrl, getUserInitial } from '../lib/auth.js';
import { showToast } from '../components/toast.js';

const API = '/api/chat';
let _pollTimer = null;
let _currentConvId = null;
let _lastMsgTime = null;

// ─── Helpers ─────────────────────────────────────────────────────────
function avatar(avatarFileId, username, size = 36) {
  const url = getAvatarUrl(avatarFileId);
  const initial = getUserInitial(username || '?');
  if (url) {
    return `<img src="${url}" width="${size}" height="${size}"
      style="border-radius:50%;object-fit:cover;border:2px solid var(--primary);" />`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;
    background:linear-gradient(135deg,var(--primary),var(--primary-dark));
    display:flex;align-items:center;justify-content:center;
    font-size:${Math.round(size*0.4)}px;font-weight:700;color:white;flex-shrink:0;">${initial}</div>`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ─── API calls ───────────────────────────────────────────────────────
async function apiGet(path) {
  const r = await authFetch(path);
  return r.json();
}

async function apiPost(path, body) {
  const r = await authFetch(path, { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}

// ─── Render: lista de conversaciones ─────────────────────────────────
async function loadConversations() {
  try {
    const data = await apiGet(`${API}/conversations`);
    return data.conversations || [];
  } catch { return []; }
}

async function loadUsers(search = '') {
  try {
    const data = await apiGet(`${API}/users?search=${encodeURIComponent(search)}`);
    return data.users || [];
  } catch { return []; }
}

async function loadMessages(convId) {
  try {
    const data = await apiGet(`${API}/messages?conversation_id=${convId}`);
    return data.messages || [];
  } catch { return []; }
}

// ─── Polling ─────────────────────────────────────────────────────────
function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function startPolling(convId) {
  stopPolling();
  _pollTimer = setInterval(async () => {
    if (!_lastMsgTime) return;
    try {
      const data = await apiGet(
        `${API}/messages?conversation_id=${convId}&since=${encodeURIComponent(_lastMsgTime)}`
      );
      const msgs = data.messages || [];
      if (msgs.length > 0) appendMessages(msgs);
    } catch { /* silencioso */ }
  }, 2500);
}

// ─── Render: burbuja de mensaje ───────────────────────────────────────
function renderBubble(msg, myId) {
  const mine = msg.sender_id == myId;
  const align = mine ? 'flex-end' : 'flex-start';
  const bg = mine
    ? 'linear-gradient(135deg,var(--primary),var(--primary-dark))'
    : 'var(--surface-2)';
  const color = mine ? '#fff' : 'var(--text)';
  const read = mine && msg.read_at
    ? `<span style="font-size:10px;opacity:0.7;margin-left:4px;">✓✓</span>` : '';

  return `
    <div id="chat-msg-${msg.id}" style="display:flex;justify-content:${align};margin-bottom:8px;">
      <div style="max-width:72%;background:${bg};color:${color};
        padding:10px 14px;border-radius:${mine ? '18px 4px 18px 18px' : '4px 18px 18px 18px'};
        font-size:0.9rem;line-height:1.45;word-break:break-word;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);">
        ${msg.content}
        <div style="font-size:10px;opacity:0.65;margin-top:4px;text-align:right;">
          ${formatTime(msg.created_at)}${read}
        </div>
      </div>
    </div>`;
}

function appendMessages(msgs) {
  const area = document.getElementById('chat-messages-area');
  if (!area) return;
  const me = getUser();
  msgs.forEach(m => {
    if (document.getElementById(`chat-msg-${m.id}`)) return;
    const div = document.createElement('div');
    div.innerHTML = renderBubble(m, me.id);
    area.appendChild(div.firstElementChild);
    _lastMsgTime = m.created_at;
  });
  area.scrollTop = area.scrollHeight;
}

// ─── Render: panel de mensajes ────────────────────────────────────────
async function openConversation(convId, otherUserId, otherUsername, otherAvatar) {
  _currentConvId = convId;
  stopPolling();

  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  const me = getUser();
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:16px;
      border-bottom:1px solid var(--border);background:var(--surface);">
      ${avatar(otherAvatar, otherUsername, 38)}
      <div>
        <div style="font-weight:700;color:var(--text);">@${otherUsername}</div>
        <div style="font-size:11px;color:var(--text-muted);">En línea</div>
      </div>
    </div>
    <div id="chat-messages-area" style="flex:1;overflow-y:auto;padding:16px;
      display:flex;flex-direction:column;gap:2px;">
      <div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:20px;">
        Cargando mensajes…
      </div>
    </div>
    <form id="chat-send-form" style="display:flex;gap:8px;padding:12px 16px;
      border-top:1px solid var(--border);background:var(--surface);">
      <input id="chat-input" type="text" placeholder="Escribí un mensaje…"
        autocomplete="off"
        style="flex:1;padding:10px 14px;border-radius:24px;
          border:1px solid var(--border);background:var(--surface-2);
          color:var(--text);font-size:0.9rem;outline:none;
          transition:border-color 0.2s;"
        maxlength="2000" />
      <button type="submit"
        style="width:44px;height:44px;border-radius:50%;border:none;
          background:linear-gradient(135deg,var(--primary),var(--primary-dark));
          color:white;cursor:pointer;display:flex;align-items:center;
          justify-content:center;flex-shrink:0;font-size:1.1rem;
          transition:transform 0.15s;box-shadow:0 2px 8px rgba(232,115,74,0.4);">
        ➤
      </button>
    </form>`;

  // Cargar mensajes
  const msgs = await loadMessages(convId);
  const area = document.getElementById('chat-messages-area');
  if (msgs.length === 0) {
    area.innerHTML = `<div style="text-align:center;color:var(--text-muted);
      font-size:0.85rem;padding:40px 20px;">¡Sé el primero en escribir! 👋</div>`;
  } else {
    area.innerHTML = msgs.map(m => renderBubble(m, me.id)).join('');
    _lastMsgTime = msgs[msgs.length - 1].created_at;
    area.scrollTop = area.scrollHeight;
  }

  // Form submit
  document.getElementById('chat-send-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      const data = await apiPost(`${API}/messages`, { conversation_id: convId, content });
      if (data.message) {
        const div = document.createElement('div');
        div.innerHTML = renderBubble(data.message, me.id);
        area.appendChild(div.firstElementChild);
        _lastMsgTime = data.message.created_at;
        area.scrollTop = area.scrollHeight;
      }
    } catch (err) { showToast('Error enviando mensaje', 'error'); }
  });

  startPolling(convId);
}

// ─── Render principal ─────────────────────────────────────────────────
export async function renderChat(params = {}) {
  stopPolling();

  // Sincronizar usuarios en segundo plano
  authFetch(`${API}/users/sync`, { method: 'POST' }).catch(() => {});

  const convs = await loadConversations();
  const me = getUser();

  const convListHtml = convs.length === 0
    ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
        Aún no tenés conversaciones.<br>Buscá un usuario para comenzar.
       </div>`
    : convs.map(c => {
        const otherId = c.other_user_id;
        const unread = parseInt(c.unread_count) || 0;
        return `
        <div class="chat-conv-item" data-conv="${c.id}"
          data-other-id="${otherId}"
          onclick="window._openChatConv(${c.id},${otherId})"
          style="display:flex;align-items:center;gap:12px;padding:14px 16px;
            cursor:pointer;border-bottom:1px solid var(--border);
            transition:background 0.15s;position:relative;">
          <div id="chat-avatar-${c.id}"
            style="width:42px;height:42px;border-radius:50%;
              background:linear-gradient(135deg,var(--primary),var(--primary-dark));
              display:flex;align-items:center;justify-content:center;
              font-size:16px;font-weight:700;color:white;flex-shrink:0;">
            ?
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text);" id="chat-name-${c.id}">
              Usuario #${otherId}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${c.last_message || 'Sin mensajes aún'}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
            <span style="font-size:10px;color:var(--text-muted);">
              ${timeAgo(c.last_message_at || c.created_at)}
            </span>
            ${unread > 0
              ? `<span style="background:var(--primary);color:white;
                  border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;">
                  ${unread}
                 </span>`
              : ''}
          </div>
        </div>`;
      }).join('');

  const html = `
    <style>
      .chat-conv-item:hover { background: var(--surface-2) !important; }
      .chat-search-input:focus { border-color: var(--primary) !important; }
      .chat-input-focused { border-color: var(--primary) !important; }
      @media (max-width: 640px) {
        #chat-sidebar { display: ${params.convId ? 'none' : 'flex'} !important; }
        #chat-panel   { display: ${params.convId ? 'flex' : 'none'} !important; }
      }
    </style>

    <div id="chat-container" style="display:flex;height:calc(100vh - 120px);
      overflow:hidden;border-radius:16px;border:1px solid var(--border);
      background:var(--surface);margin:0 -4px;">

      <!-- Sidebar -->
      <div id="chat-sidebar" style="width:320px;display:flex;flex-direction:column;
        border-right:1px solid var(--border);flex-shrink:0;">

        <!-- Header sidebar -->
        <div style="padding:16px;border-bottom:1px solid var(--border);">
          <h1 style="margin:0 0 12px;font-size:1.1rem;font-weight:700;color:var(--text);">
            💬 Mensajes
          </h1>
          <input id="chat-user-search" class="chat-search-input"
            type="text" placeholder="Buscar usuario…"
            style="width:100%;padding:9px 14px;border-radius:24px;
              border:1px solid var(--border);background:var(--surface-2);
              color:var(--text);font-size:0.85rem;box-sizing:border-box;
              outline:none;transition:border-color 0.2s;" />
        </div>

        <!-- Search results -->
        <div id="chat-search-results" style="display:none;border-bottom:1px solid var(--border);
          max-height:200px;overflow-y:auto;background:var(--surface-2);">
        </div>

        <!-- Conversaciones -->
        <div style="flex:1;overflow-y:auto;">
          ${convListHtml}
        </div>
      </div>

      <!-- Panel de chat -->
      <div id="chat-panel" style="flex:1;display:flex;flex-direction:column;
        background:var(--bg);">
        <div style="display:flex;align-items:center;justify-content:center;
          height:100%;flex-direction:column;gap:12px;color:var(--text-muted);">
          <div style="font-size:3rem;">💬</div>
          <div style="font-weight:600;color:var(--text);">Seleccioná una conversación</div>
          <div style="font-size:0.85rem;">o buscá un usuario para comenzar a chatear</div>
        </div>
      </div>
    </div>`;

  // Inicializar bind después de render
  setTimeout(() => {
    // Cargar datos de usuarios en conversaciones (username + avatar)
    convs.forEach(async (c) => {
      try {
        const data = await apiGet(`/api/users/${c.other_user_id}`);
        const u = data.user;
        if (!u) return;
        const nameEl = document.getElementById(`chat-name-${c.id}`);
        const avEl = document.getElementById(`chat-avatar-${c.id}`);
        if (nameEl) nameEl.textContent = `@${u.username}`;
        if (avEl) avEl.outerHTML = avatar(u.avatar_file_id, u.username, 42);
        // Guardar datos para abrir conversación
        const item = document.querySelector(`[data-conv="${c.id}"]`);
        if (item) {
          item.dataset.username = u.username;
          item.dataset.avatar = u.avatar_file_id || '';
        }
      } catch { /* silencioso */ }
    });

    // Abrir conversación global
    window._openChatConv = async (convId, otherUserId) => {
      const item = document.querySelector(`[data-conv="${convId}"]`);
      const username = item?.dataset.username || `Usuario #${otherUserId}`;
      const avatarId = item?.dataset.avatar || null;
      // Marcar activo
      document.querySelectorAll('.chat-conv-item').forEach(el =>
        el.style.background = ''
      );
      if (item) item.style.background = 'var(--surface-2)';
      await openConversation(convId, otherUserId, username, avatarId);
    };

    // Búsqueda de usuarios
    const searchInput = document.getElementById('chat-user-search');
    const searchResults = document.getElementById('chat-search-results');
    let searchTimer = null;

    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (!q) { searchResults.style.display = 'none'; return; }
      searchTimer = setTimeout(async () => {
        const users = await loadUsers(q);
        if (!users.length) {
          searchResults.innerHTML = `<div style="padding:14px;color:var(--text-muted);
            font-size:0.85rem;text-align:center;">Sin resultados</div>`;
        } else {
          searchResults.innerHTML = users.map(u => `
            <div onclick="window._startChatWith(${u.id},'${u.username}',${u.avatar_file_id || null})"
              style="display:flex;align-items:center;gap:10px;padding:10px 16px;
                cursor:pointer;transition:background 0.15s;"
              onmouseover="this.style.background='var(--surface)'"
              onmouseout="this.style.background=''">
              ${avatar(u.avatar_file_id, u.username, 34)}
              <span style="font-size:0.9rem;color:var(--text);font-weight:600;">
                @${u.username}
              </span>
            </div>`).join('');
        }
        searchResults.style.display = 'block';
      }, 300);
    });

    // Iniciar chat con usuario desde búsqueda
    window._startChatWith = async (otherUserId, username, avatarId) => {
      searchResults.style.display = 'none';
      searchInput.value = '';
      try {
        const data = await apiPost(`${API}/conversations`, { other_user_id: otherUserId });
        if (data.conversation_id) {
          await openConversation(data.conversation_id, otherUserId, username, avatarId);
          // Recargar sidebar
          const convListEl = document.querySelector('#chat-sidebar > div:last-child');
          const newConvs = await loadConversations();
          if (convListEl && newConvs.length > 0) {
            // simplemente recargamos la vista si es nueva conversación
            if (data.created) window.dispatchEvent(new HashChangeEvent('hashchange'));
          }
        }
      } catch (err) {
        showToast('Error al iniciar conversación', 'error');
      }
    };

    // Abrir conversación desde params si viene en URL
    if (params.userId) {
      const userId = parseInt(params.userId);
      const existing = convs.find(c => c.other_user_id == userId);
      if (existing) {
        window._openChatConv(existing.id, userId);
      } else {
        apiGet(`/api/users/${userId}`).then(data => {
          if (data.user) {
            window._startChatWith(userId, data.user.username, data.user.avatar_file_id);
          }
        }).catch(() => {});
      }
    }
  }, 50);

  return html;
}
