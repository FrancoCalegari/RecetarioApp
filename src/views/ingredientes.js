/* ═══════════════════════════════════════════════════════════════════
   Ingredientes View — CRUD with descriptions, photos, privacy & categories
   ═══════════════════════════════════════════════════════════════════ */

import { select, insert, remove, update, esc, uploadFile, getFileUrl } from '../lib/api.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { isLoggedIn, getUser } from '../lib/auth.js';
import { CATEGORIAS_ING, getCatInfo } from './comunidad-ingredientes.js';

let ingredientes = [];
let searchQuery = '';
let filterCategory = '';

const PRIVACIDAD_OPTS = [
  { value: 'privado',    label: '🔒 Privado',    desc: 'Solo vos lo ves' },
  { value: 'no_listado', label: '🔗 No listado',  desc: 'Visible con el link' },
  { value: 'publico',    label: '🌍 Público',     desc: 'Visible en la comunidad' },
];

function getCategoryIcon(cat) {
  return getCatInfo(cat)?.icon || '📦';
}

async function loadIngredientes() {
  const user = getUser();
  try {
    let sql = `SELECT i.*, ROUND(AVG(pi.puntaje),1) as promedio_puntaje, COUNT(pi.id) as total_votos FROM ingredientes i LEFT JOIN puntajes_ingredientes pi ON pi.ingrediente_id = i.id`;
    // Show user's own + public ones if logged in, else only public
    if (user) {
      sql += ` WHERE i.autor_id = ${user.id} OR i.privacidad = 'publico' OR i.autor_id IS NULL`;
    } else {
      sql += ` WHERE i.privacidad = 'publico' OR i.autor_id IS NULL`;
    }
    sql += ` GROUP BY i.id ORDER BY i.categoria, i.nombre`;
    ingredientes = await select(sql) || [];
  } catch (e) {
    console.warn('Error loading ingredients:', e);
    ingredientes = [];
  }
}

function getFiltered() {
  let results = ingredientes;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    results = results.filter((i) => i.nombre.toLowerCase().includes(q) || (i.descripcion && i.descripcion.toLowerCase().includes(q)));
  }
  if (filterCategory) {
    results = results.filter((i) => (i.categoria || 'otros').toLowerCase() === filterCategory);
  }
  return results;
}

function renderPrivacyTag(priv) {
  const map = { publico: ['tag-accent', '🌍'], no_listado: ['tag-primary', '🔗'], privado: ['', '🔒'] };
  const [cls, icon] = map[priv] || ['', '🔒'];
  return `<span class="tag ${cls}">${icon}</span>`;
}

function renderContent() {
  const container = document.getElementById('ingredientes-content');
  if (!container) return;

  const filtered = getFiltered();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🥕</div>
        <div class="empty-state-title">${searchQuery || filterCategory ? 'Sin resultados' : 'Sin ingredientes aún'}</div>
        <div class="empty-state-text">${!searchQuery && !filterCategory ? 'Agregá tu primer ingrediente con el botón +' : 'Probá con otros filtros'}</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="ingredient-grid">
      ${filtered.map((ing) => {
        const fotoUrl = getFileUrl(ing.foto_file_id);
        const catInfo = getCatInfo(ing.categoria);
        const user = getUser();
        const isOwn = user && ing.autor_id === user.id;
        return `
          <div class="ingredient-card" id="ingredient-${ing.id}">
            <div class="ingredient-card-icon" style="position:relative; overflow:hidden; ${fotoUrl ? 'padding:0;' : ''}">
              ${fotoUrl
                ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm);" onerror="this.outerHTML='${catInfo.icon}'" />`
                : catInfo.icon}
            </div>
            <div class="ingredient-card-info">
              <div class="ingredient-card-name">${ing.nombre}</div>
              <div class="ingredient-card-cat">${catInfo.icon} ${catInfo.label}</div>
              ${ing.promedio_puntaje ? `<div class="text-xs" style="color:var(--primary);">⭐ ${ing.promedio_puntaje}</div>` : ''}
            </div>
            ${renderPrivacyTag(ing.privacidad || 'privado')}
            ${isOwn ? `
              <button class="btn btn-ghost btn-sm" onclick="window.dispatchEvent(new CustomEvent('edit-ingredient', { detail: { id: ${ing.id} } }))" style="padding:4px;" title="Editar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function showCreateModal(editIng = null) {
  const user = getUser();
  const isEdit = !!editIng;

  openModal({
    title: isEdit ? 'Editar ingrediente' : 'Nuevo ingrediente',
    content: `
      <div class="flex flex-col gap-md">
        <!-- Foto preview -->
        <div class="form-group">
          <label class="form-label">Foto o ícono</label>
          <div id="ing-photo-preview" style="width:80px;height:80px;border-radius:var(--radius-md);background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:8px;overflow:hidden;">
            ${editIng?.foto_file_id ? `<img src="${getFileUrl(editIng.foto_file_id)}" style="width:100%;height:100%;object-fit:cover;" />` : (getCatInfo(editIng?.categoria)?.icon || '📸')}
          </div>
          <input type="file" accept="image/*" class="form-input" id="ing-foto" style="padding:8px;font-size:0.82rem;" />
        </div>
        <div class="form-group">
          <label class="form-label">Nombre *</label>
          <input type="text" class="form-input" id="ing-nombre" placeholder="Ej: Tomate" value="${editIng?.nombre || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea class="form-input" id="ing-descripcion" rows="2" placeholder="Breve descripción del ingrediente...">${editIng?.descripcion || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select class="form-input" id="ing-categoria">
            <option value="">Sin categoría</option>
            ${CATEGORIAS_ING.map((c) =>
              `<option value="${c.key}" ${(editIng?.categoria || '').toLowerCase() === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>`
            ).join('')}
          </select>
        </div>
        ${user ? `
          <div class="form-group">
            <label class="form-label">Privacidad</label>
            <select class="form-input" id="ing-privacidad">
              ${PRIVACIDAD_OPTS.map((p) =>
                `<option value="${p.value}" ${(editIng?.privacidad || 'privado') === p.value ? 'selected' : ''}>${p.label} — ${p.desc}</option>`
              ).join('')}
            </select>
          </div>` : ''}
        <div class="flex gap-sm">
          ${isEdit ? `<button class="btn btn-secondary w-full" id="btn-delete-ing" style="color:#E85454; border-color:#E85454;">Eliminar</button>` : ''}
          <button class="btn btn-accent w-full" id="btn-save-ing">${isEdit ? 'Guardar' : 'Crear'}</button>
        </div>
      </div>`,
  });

  setTimeout(() => {
    // Photo preview
    document.getElementById('ing-foto')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = document.getElementById('ing-photo-preview');
          if (preview) preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;" />`;
        };
        reader.readAsDataURL(file);
      }
    });

    // Save
    document.getElementById('btn-save-ing')?.addEventListener('click', async () => {
      const nombre = document.getElementById('ing-nombre')?.value?.trim();
      if (!nombre) return showToast('El nombre es obligatorio', 'error');

      const descripcion = document.getElementById('ing-descripcion')?.value?.trim() || null;
      const categoria = document.getElementById('ing-categoria')?.value || null;
      const privacidad = document.getElementById('ing-privacidad')?.value || 'privado';
      const fotoFile = document.getElementById('ing-foto')?.files[0];

      let foto_file_id = editIng?.foto_file_id || null;
      if (fotoFile) {
        try {
          showToast('Subiendo foto...', 'info', 1500);
          const uploadRes = await uploadFile(fotoFile);
          foto_file_id = uploadRes?.files?.[0]?.id || uploadRes?.id || null;
        } catch { showToast('Error subiendo foto', 'error'); }
      }

      const data = { nombre, descripcion, categoria, privacidad, foto_file_id };
      if (user) data.autor_id = user.id;

      try {
        if (isEdit) {
          await update('ingredientes', editIng.id, data);
          showToast('Ingrediente actualizado ✓', 'success');
        } else {
          await insert('ingredientes', data);
          showToast('Ingrediente creado ✓', 'success');
        }
        closeModal();
        await loadIngredientes();
        renderContent();
        updateCount();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });

    // Delete
    document.getElementById('btn-delete-ing')?.addEventListener('click', async () => {
      try {
        const usage = await select(`SELECT COUNT(*) as total FROM receta_ingredientes WHERE ingrediente_id = ${editIng.id}`);
        if ((usage?.[0]?.total || 0) > 0) {
          return showToast(`Usado en recetas. Eliminalo de las recetas primero.`, 'error');
        }
        await remove('ingredientes', editIng.id);
        closeModal();
        showToast('Ingrediente eliminado', 'success');
        await loadIngredientes();
        renderContent();
        updateCount();
      } catch (e) { showToast('Error al eliminar', 'error'); }
    });
  }, 100);
}

function updateCount() {
  const el = document.getElementById('ingredientes-count');
  if (el) el.textContent = `${ingredientes.length} ingredientes`;
}

function bindEvents() {
  document.getElementById('ingredientes-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderContent();
  });

  document.querySelectorAll('.chip[data-cat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      if (filterCategory === cat) {
        filterCategory = '';
        chip.classList.remove('active');
      } else {
        document.querySelectorAll('.chip[data-cat]').forEach((c) => c.classList.remove('active'));
        filterCategory = cat;
        chip.classList.add('active');
      }
      renderContent();
    });
  });

  document.getElementById('fab-new-ingredient')?.addEventListener('click', () => {
    if (!isLoggedIn()) { showToast('Iniciá sesión para crear ingredientes', 'error'); window.location.hash = '/login'; return; }
    showCreateModal();
  });

  window.addEventListener('edit-ingredient', (e) => {
    const ing = ingredientes.find((i) => i.id === e.detail.id);
    if (ing) showCreateModal(ing);
  });
}

export async function renderIngredientes() {
  searchQuery = '';
  filterCategory = '';
  await loadIngredientes();

  const categoryChips = CATEGORIAS_ING.map((c) =>
    `<button class="chip" data-cat="${c.key}">${c.icon} ${c.key.charAt(0).toUpperCase() + c.key.slice(1)}</button>`
  ).join('');

  setTimeout(() => { renderContent(); bindEvents(); }, 50);

  return `
    <div class="section-header">
      <div>
        <h1 class="heading-lg">🥕 Ingredientes</h1>
        <p class="text-sm text-muted" id="ingredientes-count">${ingredientes.length} ingredientes</p>
      </div>
    </div>

    <div class="search-bar">
      <div class="search-bar-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <input type="text" id="ingredientes-search" placeholder="Buscar ingredientes..." />
    </div>

    <div class="chip-group mb-md" style="overflow-x:auto; flex-wrap:nowrap; padding-bottom:4px;">
      ${categoryChips}
    </div>

    <div id="ingredientes-content">
      <div class="empty-state"><div class="loading-spinner"></div></div>
    </div>

    <button class="btn-fab" id="fab-new-ingredient" title="Nuevo ingrediente">+</button>
  `;
}
