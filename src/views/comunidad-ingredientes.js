/* ═══════════════════════════════════════════════════════════════════
   Comunidad Ingredientes View — Public ingredients with ratings
   ═══════════════════════════════════════════════════════════════════ */

import { select, getFileUrl, rateIngrediente } from '../lib/api.js';
import { isLoggedIn, getAvatarUrl, getUserInitial } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

export const CATEGORIAS_ING = [
  { key: 'mineral',  label: 'Mineral',  icon: '🪨' },
  { key: 'aceite',   label: 'Aceite',   icon: '🫒' },
  { key: 'animal',   label: 'Animal',   icon: '🥩' },
  { key: 'vegetal',  label: 'Vegetal',  icon: '🥬' },
  { key: 'legumbre', label: 'Legumbre', icon: '🫘' },
  { key: 'lacteo',   label: 'Lácteo',   icon: '🧀' },
  { key: 'cereal',   label: 'Cereal',   icon: '🌾' },
  { key: 'condimento', label: 'Condimento', icon: '🧂' },
  { key: 'otros',    label: 'Otros',    icon: '📦' },
];

export function getCatInfo(cat) {
  return CATEGORIAS_ING.find((c) => c.key === (cat || '').toLowerCase()) || CATEGORIAS_ING[CATEGORIAS_ING.length - 1];
}

function renderStarsIng(puntaje, total, ingId) {
  const avg = parseFloat(puntaje) || 0;
  const filled = Math.round(avg / 2);
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < filled ? 'star-filled' : 'star-empty'}"
           onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('rate-ingrediente', { detail: { id: ${ingId}, score: ${(i + 1) * 2} } }))">★</span>`
  ).join('');
  return `<div class="rating-row">${stars}<span class="rating-label">${avg > 0 ? avg : '—'}</span></div>`;
}

function renderIngCard(i) {
  const fotoUrl = getFileUrl(i.foto_file_id);
  const catInfo = getCatInfo(i.categoria);

  return `
    <div class="card ingredient-community-card" id="community-ing-${i.id}">
      <div style="aspect-ratio:1/1; background:linear-gradient(135deg,var(--bg-elevated),var(--bg-surface)); display:flex; align-items:center; justify-content:center; font-size:2.5rem;">
        ${fotoUrl
          ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='${catInfo.icon}'" />`
          : catInfo.icon}
      </div>
      <div class="card-body">
        <div class="flex items-center justify-between mb-sm">
          <span class="tag">${catInfo.icon} ${catInfo.label}</span>
          ${i.username ? `<span class="text-xs text-muted">@${i.username}</span>` : ''}
        </div>
        <h3 class="heading-sm" style="margin-bottom:4px;">${i.nombre}</h3>
        ${i.descripcion ? `<p class="text-xs text-secondary" style="margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${i.descripcion}</p>` : ''}
        ${renderStarsIng(i.promedio_puntaje, i.total_votos, i.id)}
        <button class="btn btn-ghost btn-sm w-full mt-sm" 
                onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('add-to-my-ingredients', { detail: { id: ${i.id} } }))">
          + Agregar a mis ingredientes
        </button>
      </div>
    </div>
  `;
}

async function loadIngredientes() {
  try {
    return await select(`
      SELECT i.*,
             ROUND(AVG(pi.puntaje), 1) as promedio_puntaje,
             COUNT(pi.id) as total_votos,
             u.username
      FROM ingredientes i
      LEFT JOIN puntajes_ingredientes pi ON pi.ingrediente_id = i.id
      LEFT JOIN usuarios u ON u.id = i.autor_id
      WHERE i.privacidad = 'publico'
      GROUP BY i.id, u.username
      ORDER BY promedio_puntaje DESC, i.created_at DESC
    `);
  } catch { return []; }
}

function bindEvents() {
  // Rating
  window.addEventListener('rate-ingrediente', async (e) => {
    if (!isLoggedIn()) { showToast('Iniciá sesión para calificar', 'error'); return; }
    const { id, score } = e.detail;

    openModal({
      title: '⭐ Calificar ingrediente',
      content: `
        <p class="text-secondary mb-md">Calificación: <strong>${score}/10</strong></p>
        <div class="rating-big-stars">
          ${Array.from({ length: 5 }, (_, i) =>
            `<span class="big-star ${i < score / 2 ? 'star-filled' : 'star-empty'}">★</span>`
          ).join('')}
        </div>
        <div class="flex gap-sm mt-lg">
          <button class="btn btn-secondary w-full" onclick="document.dispatchEvent(new Event('close-modal'))">Cancelar</button>
          <button class="btn btn-accent w-full" id="confirm-rate-ing">Confirmar</button>
        </div>
      `,
    });
    setTimeout(() => {
      document.getElementById('confirm-rate-ing')?.addEventListener('click', async () => {
        try {
          const { promedio } = await rateIngrediente(id, score);
          closeModal();
          showToast(`¡Calificado! Promedio: ${promedio}/10 ⭐`, 'success');
        } catch (err) { showToast(err.message, 'error'); }
      });
    }, 100);
  });

  // Add to my ingredients (clone to personal list via planificador/recetas)
  window.addEventListener('add-to-my-ingredients', (e) => {
    showToast('Ingrediente disponible para usar en tus recetas 🥕', 'success');
  });

  // Category filter chips
  document.querySelectorAll('.chip[data-cat-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('active');
      document.querySelectorAll('.chip[data-cat-filter]').forEach((c) => c.classList.remove('active'));
      if (!isActive) chip.classList.add('active');
      const cat = isActive ? '' : chip.dataset.catFilter;
      filterByCategory(cat);
    });
  });
}

function filterByCategory(cat) {
  const cards = document.querySelectorAll('.ingredient-community-card');
  cards.forEach((card) => {
    const cardCat = card.dataset.categoria || '';
    card.closest('.card').parentElement.style.display = (!cat || cardCat === cat) ? '' : 'none';
  });
}

export async function renderComunidadIngredientes() {
  const ingredientes = await loadIngredientes();
  const top = ingredientes.filter((i) => i.total_votos > 0).slice(0, 12);
  const resto = ingredientes;

  // Group by category
  const byCat = {};
  resto.forEach((i) => {
    const cat = (i.categoria || 'otros').toLowerCase();
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(i);
  });

  const catChips = CATEGORIAS_ING.map((c) =>
    `<button class="chip" data-cat-filter="${c.key}">${c.icon} ${c.label}</button>`
  ).join('');

  const catSections = Object.entries(byCat).map(([cat, items]) => {
    const info = getCatInfo(cat);
    return `
      <div class="community-section">
        <div class="community-section-header">
          <div class="community-section-icon">${info.icon}</div>
          <div>
            <h2 class="heading-md">${info.label}</h2>
            <p class="text-xs text-muted">${items.length} ingrediente${items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div class="ingredient-grid-community">
          ${items.map((i) => `<div data-categoria="${cat}">${renderIngCard(i)}</div>`).join('')}
        </div>
      </div>
    `;
  }).join('');

  const topHtml = top.length > 0
    ? `<div class="ingredient-grid-community">${top.map((i, idx) => `
        <div style="position:relative;">
          <div class="rank-badge">#${idx + 1}</div>
          ${renderIngCard(i)}
        </div>`).join('')}</div>`
    : `<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-title">Aún sin calificaciones</div></div>`;

  setTimeout(bindEvents, 100);

  return `
    <div class="section-header">
      <h1 class="heading-lg">🥕 Ingredientes</h1>
      <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/comunidad'">🍽️ Recetas →</button>
    </div>

    ${!isLoggedIn() ? `
      <div class="auth-prompt">
        <p class="text-sm text-secondary">Iniciá sesión para calificar</p>
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='/login'">Ingresar</button>
      </div>
    ` : ''}

    <!-- Filter by category -->
    <div class="chip-group mb-lg" style="overflow-x:auto; flex-wrap:nowrap; padding-bottom:4px;">
      ${catChips}
    </div>

    <!-- Top Ingredientes -->
    <div class="community-section">
      <div class="community-section-header">
        <div class="community-section-icon">⭐</div>
        <div>
          <h2 class="heading-md">Mejores ingredientes</h2>
          <p class="text-xs text-muted">Top calificados por la comunidad</p>
        </div>
      </div>
      ${topHtml}
    </div>

    <!-- Por categoría -->
    ${catSections || `<div class="empty-state"><div class="empty-state-icon">🥕</div><div class="empty-state-title">Sin ingredientes públicos aún</div><div class="empty-state-text">Publicá tus ingredientes desde tu perfil</div></div>`}
  `;
}
