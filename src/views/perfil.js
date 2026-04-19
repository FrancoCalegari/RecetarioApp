/* ═══════════════════════════════════════════════════════════════════
   Perfil View — User profile management
   ═══════════════════════════════════════════════════════════════════ */

import { select, uploadFile, apiUpdateProfile, apiUpdateAvatar, getFileUrl } from '../lib/api.js';
import { getUser, updateUser, clearSession, getAvatarUrl, getUserInitial } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';

const PRIVACY_LABELS = {
  publico:     { label: 'Público',     icon: '🌍', cls: 'tag-accent' },
  no_listado:  { label: 'No listado',  icon: '🔗', cls: 'tag-primary' },
  privado:     { label: 'Privado',     icon: '🔒', cls: '' },
};

function renderAvatar(user, size = 72) {
  const url = getAvatarUrl(user.avatar_file_id);
  if (url) return `<img src="${url}" width="${size}" height="${size}" style="border-radius:50%; object-fit:cover; border: 3px solid var(--primary);" alt="${user.username}" onerror="this.outerHTML='${renderAvatarInitial(user, size)}'" />`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;font-size:${size*0.4}px;font-weight:700;color:white;border:3px solid var(--primary);">${getUserInitial(user.username)}</div>`;
}

function renderAvatarInitial(user, size) {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;font-size:${size*0.4}px;font-weight:700;color:white;">${getUserInitial(user.username)}</div>`;
}

function renderPrivacyTag(priv) {
  const p = PRIVACY_LABELS[priv] || PRIVACY_LABELS.privado;
  return `<span class="tag ${p.cls}">${p.icon} ${p.label}</span>`;
}

export async function renderPerfil() {
  const user = getUser();
  if (!user) { navigate('/login'); return ''; }

  let misRecetas = [], misIngredientes = [];
  let statsRecetas = { total: 0, promedio: 0 };
  let statsIngredientes = { total: 0, promedio: 0 };

  try {
    [misRecetas, misIngredientes] = await Promise.all([
      select(`SELECT r.*, ROUND(AVG(pr.puntaje),1) as promedio_puntaje, COUNT(pr.id) as total_votos FROM recetas r LEFT JOIN puntajes_recetas pr ON pr.receta_id = r.id WHERE r.autor_id = ${user.id} GROUP BY r.id ORDER BY r.created_at DESC`),
      select(`SELECT i.*, ROUND(AVG(pi.puntaje),1) as promedio_puntaje, COUNT(pi.id) as total_votos FROM ingredientes i LEFT JOIN puntajes_ingredientes pi ON pi.ingrediente_id = i.id WHERE i.autor_id = ${user.id} GROUP BY i.id ORDER BY i.created_at DESC`),
    ]);
    statsRecetas.total = misRecetas.length;
    statsRecetas.promedio = misRecetas.length ? (misRecetas.reduce((a, r) => a + (parseFloat(r.promedio_puntaje) || 0), 0) / misRecetas.length).toFixed(1) : 0;
    statsIngredientes.total = misIngredientes.length;
  } catch (e) { console.warn('Profile data error:', e); }

  setTimeout(() => bindPerfilEvents(user), 100);

  const recetasHtml = misRecetas.length > 0
    ? misRecetas.map((r) => `
        <div class="profile-item-row" id="profile-recipe-${r.id}">
          <div style="flex:1; min-width:0;">
            <div class="heading-sm truncate">${r.nombre}</div>
            <div class="flex gap-xs mt-sm flex-wrap">
              ${renderPrivacyTag(r.privacidad || 'privado')}
              ${r.promedio_puntaje ? `<span class="tag">⭐ ${r.promedio_puntaje} (${r.total_votos})</span>` : '<span class="tag">Sin votos</span>'}
            </div>
          </div>
          <div class="flex gap-xs">
            ${r.privacidad !== 'publico' ? `<button class="btn btn-ghost btn-sm" onclick="window.dispatchEvent(new CustomEvent('profile-publish', { detail: { type:'receta', id:${r.id}} }))" title="Publicar">🌍</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/receta/${r.id}'">Ver</button>
            <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/receta/editar/${r.id}'">✏️</button>
          </div>
        </div>
      `).join('')
    : '<p class="text-sm text-muted text-center" style="padding:var(--space-md);">Aún no creaste recetas</p>';

  const ingrHtml = misIngredientes.length > 0
    ? misIngredientes.map((i) => `
        <div class="profile-item-row" id="profile-ing-${i.id}">
          <div style="flex:1; min-width:0;">
            <div class="heading-sm truncate">${i.nombre}</div>
            <div class="flex gap-xs mt-sm flex-wrap">
              ${renderPrivacyTag(i.privacidad || 'privado')}
              ${i.promedio_puntaje ? `<span class="tag">⭐ ${i.promedio_puntaje}</span>` : ''}
            </div>
          </div>
          ${i.privacidad !== 'publico' ? `<button class="btn btn-ghost btn-sm" onclick="window.dispatchEvent(new CustomEvent('profile-publish', { detail: { type:'ingrediente', id:${i.id}} }))">🌍</button>` : ''}
        </div>
      `).join('')
    : '<p class="text-sm text-muted text-center" style="padding:var(--space-md);">Aún no creaste ingredientes</p>';

  return `
    <!-- Avatar + Info -->
    <div class="profile-header">
      <div id="avatar-wrapper" style="position:relative; cursor:pointer;" onclick="document.getElementById('avatar-input').click()">
        ${renderAvatar(user, 90)}
        <div class="avatar-edit-badge">📷</div>
      </div>
      <input type="file" id="avatar-input" accept="image/*" class="hidden" />
      <div style="flex:1; min-width:0;">
        <h1 class="heading-lg">@${user.username}</h1>
        <p class="text-sm text-secondary">${user.email}</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid-2 mb-lg">
      <div class="stat-card"><div class="stat-value">${statsRecetas.total}</div><div class="stat-label">Recetas</div></div>
      <div class="stat-card"><div class="stat-value">${statsIngredientes.total}</div><div class="stat-label">Ingredientes</div></div>
    </div>

    <!-- Bio -->
    <div class="card mb-lg">
      <div class="card-body">
        <div class="section-header" style="margin-bottom: var(--space-sm);">
          <h2 class="heading-sm">Bio</h2>
          <button class="btn btn-ghost btn-sm" id="btn-edit-bio">✏️ Editar</button>
        </div>
        <div id="bio-display">
          <p class="text-secondary text-sm">${user.bio || 'Sin bio todavía. Contanos algo sobre vos...'}</p>
        </div>
        <div id="bio-edit" class="hidden">
          <textarea class="form-input" id="bio-input" rows="3" placeholder="Contanos algo sobre vos...">${user.bio || ''}</textarea>
          <div class="flex gap-sm mt-sm">
            <button class="btn btn-secondary btn-sm" id="btn-bio-cancel">Cancelar</button>
            <button class="btn btn-accent btn-sm" id="btn-bio-save">Guardar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mis Recetas -->
    <div class="section-header">
      <h2 class="heading-md">📖 Mis recetas</h2>
      <button class="btn btn-primary btn-sm" onclick="window.location.hash='/receta/nueva'">+ Nueva</button>
    </div>
    <div class="card mb-lg">
      <div class="card-body" style="padding: var(--space-sm);">
        ${recetasHtml}
      </div>
    </div>

    <!-- Mis Ingredientes -->
    <div class="section-header">
      <h2 class="heading-md">🥕 Mis ingredientes</h2>
    </div>
    <div class="card mb-lg">
      <div class="card-body" style="padding: var(--space-sm);">
        ${ingrHtml}
      </div>
    </div>

    <!-- Logout -->
    <button class="btn btn-secondary w-full" id="btn-logout" style="border-color: #E85454; color: #E85454;">
      Cerrar sesión
    </button>
  `;
}

function bindPerfilEvents(user) {
  // Avatar upload
  document.getElementById('avatar-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showToast('Subiendo imagen...', 'info', 2000);
      const res = await uploadFile(file);
      const fileId = res?.files?.[0]?.id || res?.id;
      if (!fileId) throw new Error('No se obtuvo ID del archivo');
      await apiUpdateAvatar(fileId);
      updateUser({ avatar_file_id: fileId });
      showToast('Avatar actualizado ✓', 'success');
      navigate('/perfil'); // Re-render
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // Bio edit
  document.getElementById('btn-edit-bio')?.addEventListener('click', () => {
    document.getElementById('bio-display').classList.add('hidden');
    document.getElementById('bio-edit').classList.remove('hidden');
  });
  document.getElementById('btn-bio-cancel')?.addEventListener('click', () => {
    document.getElementById('bio-display').classList.remove('hidden');
    document.getElementById('bio-edit').classList.add('hidden');
  });
  document.getElementById('btn-bio-save')?.addEventListener('click', async () => {
    const bio = document.getElementById('bio-input')?.value?.trim() || '';
    try {
      await apiUpdateProfile({ bio });
      updateUser({ bio });
      showToast('Bio actualizada ✓', 'success');
      navigate('/perfil');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  });

  // Publish recipe/ingredient
  window.addEventListener('profile-publish', async (e) => {
    const { type, id } = e.detail;
    try {
      if (type === 'receta') {
        await fetch('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `UPDATE recetas SET privacidad = 'publico' WHERE id = ${id}` }) });
      } else {
        await fetch('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `UPDATE ingredientes SET privacidad = 'publico' WHERE id = ${id}` }) });
      }
      showToast('¡Publicado en la comunidad! 🌍', 'success');
      navigate('/perfil');
    } catch { showToast('Error al publicar', 'error'); }
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession();
    showToast('Sesión cerrada', 'success');
    navigate('/login');
  });
}
