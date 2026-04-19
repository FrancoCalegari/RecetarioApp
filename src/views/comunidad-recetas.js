/* ═══════════════════════════════════════════════════════════════════
   Comunidad Recetas View — Public recipe discovery + ratings
   ═══════════════════════════════════════════════════════════════════ */

import { select, getFileUrl, rateReceta } from '../lib/api.js';
import { isLoggedIn, getUser, getAvatarUrl, getUserInitial } from '../lib/auth.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

function renderStars(puntaje, total, recetaId) {
  const avg = parseFloat(puntaje) || 0;
  const filled = Math.round(avg / 2); // 10-point scale → 5 stars
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < filled ? 'star-filled' : 'star-empty'}" 
           data-receta="${recetaId}" data-score="${(i + 1) * 2}"
           onclick="window.dispatchEvent(new CustomEvent('rate-receta', { detail: { id: ${recetaId}, score: ${(i + 1) * 2} } }))">★</span>`
  ).join('');
  return `<div class="rating-row">${stars}<span class="rating-label">${avg > 0 ? avg : '—'} (${total} votos)</span></div>`;
}

function renderAuthorBadge(r) {
  const avatarUrl = getAvatarUrl(r.avatar_file_id);
  const initial = getUserInitial(r.username || 'U');
  const avatar = avatarUrl
    ? `<img src="${avatarUrl}" width="22" height="22" style="border-radius:50%; object-fit:cover;" />`
    : `<div style="width:22px;height:22px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;">${initial}</div>`;
  return `<div class="author-badge" onclick="event.stopPropagation()" style="cursor:default;">${avatar}<span class="text-xs text-secondary">@${r.username || 'Anónimo'}</span></div>`;
}

function renderCommunityCard(r) {
  const imageUrl = getFileUrl(r.imagen_file_id);
  const img = imageUrl
    ? `<img class="card-image" src="${imageUrl}" alt="${r.nombre}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-image-placeholder\\'>🍽️</div>'">`
    : `<div class="card-image-placeholder">🍽️</div>`;

  return `
    <article class="card" onclick="window.location.hash='/receta/${r.id}'" style="cursor:pointer;" id="community-recipe-${r.id}">
      ${img}
      <div class="card-body">
        <div class="flex items-center justify-between mb-sm">
          ${renderAuthorBadge(r)}
          <span class="tag tag-accent">🌍 Pública</span>
        </div>
        <h3 class="heading-sm" style="margin-bottom:6px;">${r.nombre}</h3>
        ${r.descripcion ? `<p class="text-sm text-secondary truncate">${r.descripcion}</p>` : ''}
        <div style="margin-top: var(--space-sm);">
          ${renderStars(r.promedio_puntaje, r.total_votos, r.id)}
        </div>
        ${r.tiempo_preparacion ? `<span class="tag" style="margin-top:8px;">⏱ ${r.tiempo_preparacion} min</span>` : ''}
      </div>
    </article>
  `;
}

async function loadCommunityRecipes() {
  try {
    return await select(`
      SELECT r.*, 
             ROUND(AVG(pr.puntaje), 1) as promedio_puntaje,
             COUNT(pr.id) as total_votos,
             u.username, u.avatar_file_id
      FROM recetas r
      LEFT JOIN puntajes_recetas pr ON pr.receta_id = r.id
      LEFT JOIN usuarios u ON u.id = r.autor_id
      WHERE r.privacidad = 'publico'
      GROUP BY r.id, u.username, u.avatar_file_id
      ORDER BY promedio_puntaje DESC, r.created_at DESC
    `);
  } catch { return []; }
}

function bindRating() {
  window.addEventListener('rate-receta', async (e) => {
    if (!isLoggedIn()) {
      showToast('Tenés que iniciar sesión para calificar', 'error');
      return;
    }
    const { id, score } = e.detail;

    openModal({
      title: '⭐ Calificar receta',
      content: `
        <p class="text-secondary mb-md">Estás dando una calificación de <strong>${score}/10</strong></p>
        <div class="rating-big-stars">
          ${Array.from({ length: 5 }, (_, i) =>
            `<span class="big-star ${i < score / 2 ? 'star-filled' : 'star-empty'}">★</span>`
          ).join('')}
        </div>
        <div class="flex gap-sm mt-lg">
          <button class="btn btn-secondary w-full" onclick="document.dispatchEvent(new Event('close-modal'))">Cancelar</button>
          <button class="btn btn-accent w-full" id="confirm-rate">Confirmar</button>
        </div>
      `,
    });
    setTimeout(() => {
      document.getElementById('confirm-rate')?.addEventListener('click', async () => {
        try {
          const { promedio, total } = await rateReceta(id, score);
          closeModal();
          showToast(`¡Calificado! Promedio: ${promedio}/10 ⭐`, 'success');
          // Update stars in DOM
          const card = document.getElementById(`community-recipe-${id}`);
          if (card) {
            const ratingRow = card.querySelector('.rating-row');
            if (ratingRow) { /* re-render stars */
              const filled = Math.round(parseFloat(promedio) / 2);
              ratingRow.innerHTML = Array.from({ length: 5 }, (_, i) =>
                `<span class="star ${i < filled ? 'star-filled' : 'star-empty'}">★</span>`
              ).join('') + `<span class="rating-label">${promedio} (${total} votos)</span>`;
            }
          }
        } catch (err) { showToast(err.message, 'error'); }
      });
    }, 100);
  });
}

export async function renderComunidadRecetas() {
  const recetas = await loadCommunityRecipes();
  const top10 = recetas.filter((r) => r.total_votos > 0).slice(0, 10);
  const recientes = recetas.slice(0, 20);

  setTimeout(bindRating, 100);

  const topHtml = top10.length > 0
    ? `<div class="grid-cards">${top10.map((r, i) => `
        <div style="position:relative;">
          <div class="rank-badge">#${i + 1}</div>
          ${renderCommunityCard(r)}
        </div>`).join('')}</div>`
    : `<div class="empty-state"><div class="empty-state-icon">⭐</div><div class="empty-state-title">Aún no hay recetas calificadas</div><div class="empty-state-text">Sé el primero en publicar y calificar</div></div>`;

  const recientesHtml = recientes.length > 0
    ? `<div class="grid-cards">${recientes.map(renderCommunityCard).join('')}</div>`
    : `<div class="empty-state"><div class="empty-state-icon">🌍</div><div class="empty-state-title">Sin recetas públicas aún</div><div class="empty-state-text">Publicá tus recetas desde tu perfil</div></div>`;

  return `
    <div class="section-header">
      <h1 class="heading-lg">🌍 Comunidad</h1>
      <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/comunidad/ingredientes'">🥕 Ingredientes →</button>
    </div>

    ${!isLoggedIn() ? `
      <div class="auth-prompt">
        <p class="text-sm text-secondary">Iniciá sesión para calificar recetas</p>
        <button class="btn btn-primary btn-sm" onclick="window.location.hash='/login'">Ingresar</button>
      </div>
    ` : ''}

    <!-- Top Recetas -->
    <div class="community-section">
      <div class="community-section-header">
        <div class="community-section-icon">⭐</div>
        <div>
          <h2 class="heading-md">Mejores recetas</h2>
          <p class="text-xs text-muted">Ordenadas por puntaje de la comunidad</p>
        </div>
      </div>
      ${topHtml}
    </div>

    <!-- Recientes -->
    <div class="community-section">
      <div class="community-section-header">
        <div class="community-section-icon">🆕</div>
        <div>
          <h2 class="heading-md">Todas las recetas</h2>
          <p class="text-xs text-muted">Recetas públicas de la comunidad</p>
        </div>
      </div>
      ${recientesHtml}
    </div>
  `;
}
