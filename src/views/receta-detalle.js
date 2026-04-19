/* ═══════════════════════════════════════════════════════════════════
   Recipe Detail View — with author profile + star rating
   ═══════════════════════════════════════════════════════════════════ */

import { select, remove, getFileUrl, rateReceta } from '../lib/api.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { navigate } from '../lib/router.js';
import { isLoggedIn, getUser, getAvatarUrl, getUserInitial } from '../lib/auth.js';

function renderAuthorSection(receta) {
  if (!receta.autor_username) return '';
  const url = getAvatarUrl(receta.autor_avatar);
  const initial = getUserInitial(receta.autor_username);
  const avatar = url
    ? `<img src="${url}" width="36" height="36" style="border-radius:50%;object-fit:cover;" />`
    : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;font-weight:700;color:white;">${initial}</div>`;

  return `
    <div class="author-section">
      ${avatar}
      <div>
        <div class="text-xs text-muted">Receta de</div>
        <div class="text-sm font-weight-600">@${receta.autor_username}</div>
      </div>
    </div>
  `;
}

function renderRatingSection(recetaId, promedio, totalVotos, myVote) {
  const avg = parseFloat(promedio) || 0;
  const filled = Math.round(avg / 2);

  const stars = Array.from({ length: 5 }, (_, i) => {
    const score = (i + 1) * 2;
    const isFilled = myVote ? i < myVote / 2 : i < filled;
    return `<span class="star ${isFilled ? 'star-filled' : 'star-empty'} star-interactive"
                  data-score="${score}"
                  onclick="window.dispatchEvent(new CustomEvent('rate-this-recipe', { detail: { score: ${score} } }))">★</span>`;
  }).join('');

  return `
    <div class="rating-section card mb-lg">
      <div class="card-body">
        <div class="flex items-center justify-between mb-sm">
          <span class="heading-sm">Calificación</span>
          ${avg > 0 ? `<span class="rating-big-num">${avg.toFixed(1)}<span class="text-xs text-muted">/10</span></span>` : ''}
        </div>
        <div class="rating-row" style="font-size:1.6rem; gap:8px;">
          ${stars}
        </div>
        ${totalVotos > 0 ? `<p class="text-xs text-muted mt-sm">${totalVotos} voto${totalVotos !== 1 ? 's' : ''}</p>` : '<p class="text-xs text-muted mt-sm">Sin votos aún</p>'}
        ${!isLoggedIn() ? `<p class="text-xs text-secondary mt-sm">Iniciá sesión para calificar</p>` : ''}
        ${myVote ? `<p class="text-xs mt-sm" style="color:var(--accent);">Tu voto: ${myVote}/10 ⭐</p>` : ''}
      </div>
    </div>
  `;
}

export async function renderRecetaDetalle({ id }) {
  let receta = null;
  let ingredientes = [];
  let promedio = 0, totalVotos = 0, myVote = null;

  try {
    const user = getUser();
    const [recRes, ingRes, ratingRes] = await Promise.all([
      select(`SELECT r.*, u.username as autor_username, u.avatar_file_id as autor_avatar FROM recetas r LEFT JOIN usuarios u ON u.id = r.autor_id WHERE r.id = ${id}`),
      select(`SELECT ri.cantidad, ri.unidad, i.nombre, i.id as ingrediente_id FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id WHERE ri.receta_id = ${id}`),
      select(`SELECT ROUND(AVG(puntaje),1) as promedio, COUNT(*) as total FROM puntajes_recetas WHERE receta_id = ${id}`),
    ]);
    receta = recRes?.[0];
    ingredientes = ingRes || [];
    promedio = ratingRes?.[0]?.promedio || 0;
    totalVotos = ratingRes?.[0]?.total || 0;

    if (user) {
      const myVoteRes = await select(`SELECT puntaje FROM puntajes_recetas WHERE receta_id = ${id} AND usuario_id = ${user.id}`);
      myVote = myVoteRes?.[0]?.puntaje || null;
    }
  } catch (e) {
    console.error('Error loading recipe:', e);
  }

  if (!receta) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Receta no encontrada</div>
        <button class="btn btn-primary mt-md" onclick="window.location.hash='/recetas'">Volver a recetas</button>
      </div>`;
  }

  const currentUser = getUser();
  const isOwner = currentUser && receta.autor_id === currentUser.id;

  const imageUrl = getFileUrl(receta.imagen_file_id);
  const imageHtml = imageUrl
    ? `<img class="recipe-hero" src="${imageUrl}" alt="${receta.nombre}" onerror="this.outerHTML='<div class=\\'recipe-hero-placeholder\\'>🍽️</div>'">`
    : `<div class="recipe-hero-placeholder">🍽️</div>`;

  const steps = receta.instrucciones ? receta.instrucciones.split('\n').filter((s) => s.trim()) : [];

  const ingredientList = ingredientes.map((ing) => `
    <div class="ingredient-item">
      <span class="ingredient-item-dot"></span>
      <span>${ing.nombre}</span>
      ${ing.cantidad ? `<span class="ingredient-item-qty">${ing.cantidad}${ing.unidad ? ' ' + ing.unidad : ''}</span>` : ''}
    </div>`).join('');

  const stepsHtml = steps.map((step, i) => `
    <div class="instruction-step">
      <div class="step-number">${i + 1}</div>
      <div class="step-text">${step}</div>
    </div>`).join('');

  const privBadge = receta.privacidad === 'publico'
    ? '<span class="tag tag-accent">🌍 Pública</span>'
    : receta.privacidad === 'no_listado'
    ? '<span class="tag tag-primary">🔗 No listada</span>'
    : '<span class="tag">🔒 Privada</span>';

  // Bind events after render
  setTimeout(() => {
    // Rating
    window.addEventListener('rate-this-recipe', async (e) => {
      if (!isLoggedIn()) { showToast('Iniciá sesión para calificar', 'error'); return; }
      const { score } = e.detail;

      openModal({
        title: '⭐ Calificar receta',
        content: `
          <p class="text-secondary mb-md">Estás dando una calificación de <strong>${score}/10</strong> a "${receta.nombre}"</p>
          <div class="rating-big-stars">
            ${Array.from({ length: 5 }, (_, i) => `<span class="big-star ${i < score / 2 ? 'star-filled' : 'star-empty'}">★</span>`).join('')}
          </div>
          <div class="flex gap-sm mt-lg">
            <button class="btn btn-secondary w-full" onclick="document.dispatchEvent(new Event('close-modal'))">Cancelar</button>
            <button class="btn btn-accent w-full" id="confirm-rate-detail">Confirmar</button>
          </div>`,
      });
      setTimeout(() => {
        document.getElementById('confirm-rate-detail')?.addEventListener('click', async () => {
          try {
            const { promedio: np, total: nt } = await rateReceta(id, score);
            closeModal();
            showToast(`¡Gracias! Promedio: ${np}/10 ⭐`, 'success');
            // Update rating section
            const rs = document.getElementById('rating-section');
            if (rs) rs.innerHTML = renderRatingSection(id, np, nt, score).replace('<div class="rating-section card mb-lg"><div class="card-body">', '').replace('</div></div>', '');
          } catch (err) { showToast(err.message, 'error'); }
        });
      }, 100);
    });

    // Delete
    document.getElementById('btn-delete-recipe')?.addEventListener('click', () => {
      openModal({
        title: '¿Eliminar receta?',
        content: `
          <p class="text-secondary mb-lg">Esta acción no se puede deshacer. Se eliminará "${receta.nombre}" permanentemente.</p>
          <div class="flex gap-sm">
            <button class="btn btn-secondary w-full" onclick="document.dispatchEvent(new Event('close-modal'))">Cancelar</button>
            <button class="btn btn-primary w-full" id="confirm-delete-recipe" style="background:linear-gradient(135deg,#E85454,#C83232);">Eliminar</button>
          </div>`,
      });
      setTimeout(() => {
        document.getElementById('confirm-delete-recipe')?.addEventListener('click', async () => {
          try {
            await select(`DELETE FROM receta_ingredientes WHERE receta_id = ${id}`);
            await remove('recetas', id);
            closeModal();
            showToast('Receta eliminada', 'success');
            navigate('/recetas');
          } catch { showToast('Error al eliminar', 'error'); }
        });
      }, 100);
    });

    // Add to plan
    document.getElementById('btn-add-to-plan')?.addEventListener('click', () => {
      openModal({
        title: 'Agregar al plan',
        content: `
          <div class="flex flex-col gap-md">
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input type="date" class="form-input" id="plan-date" value="${new Date().toISOString().split('T')[0]}" />
            </div>
            <div class="form-group">
              <label class="form-label">Momento</label>
              <select class="form-input" id="plan-momento">
                <option value="desayuno">🌅 Desayuno</option>
                <option value="almuerzo" selected>🍽️ Almuerzo</option>
                <option value="media_tarde">☕ Media Tarde</option>
                <option value="cena">🌙 Cena</option>
                <option value="picaditas">🍿 Picaditas</option>
              </select>
            </div>
            <button class="btn btn-accent w-full" id="confirm-add-plan">Agregar al plan</button>
          </div>`,
      });
      setTimeout(() => {
        document.getElementById('confirm-add-plan')?.addEventListener('click', async () => {
          const fecha = document.getElementById('plan-date').value;
          const momento = document.getElementById('plan-momento').value;
          if (!fecha) return showToast('Seleccioná una fecha', 'error');
          try {
            const { insert } = await import('../lib/api.js');
            await insert('planificacion_semanal', { fecha, momento, receta_id: receta.id });
            closeModal();
            showToast('Agregado al plan ✓', 'success');
          } catch { showToast('Error al agregar', 'error'); }
        });
      }, 100);
    });
  }, 100);

  return `
    ${imageHtml}

    <!-- Header -->
    <div class="flex items-center justify-between mb-sm">
      <h1 class="heading-lg" style="flex:1; min-width:0;">${receta.nombre}</h1>
      ${isOwner ? `
        <div class="flex gap-xs">
          <button class="btn btn-ghost btn-icon" onclick="window.location.hash='/receta/editar/${id}'" title="Editar" id="btn-edit-recipe">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon" id="btn-delete-recipe" title="Eliminar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>` : ''}
    </div>

    <!-- Privacy + Author -->
    <div class="flex items-center gap-sm mb-md flex-wrap">
      ${privBadge}
      ${renderAuthorSection(receta)}
    </div>

    ${receta.descripcion ? `<p class="text-secondary mb-md">${receta.descripcion}</p>` : ''}

    <!-- Meta -->
    <div class="recipe-meta mb-md">
      ${receta.tiempo_preparacion ? `<div class="recipe-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${receta.tiempo_preparacion} min</div>` : ''}
      ${receta.porciones ? `<div class="recipe-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${receta.porciones} porción${receta.porciones > 1 ? 'es' : ''}</div>` : ''}
    </div>

    <!-- Rating -->
    <div id="rating-section">${renderRatingSection(id, promedio, totalVotos, myVote)}</div>

    <!-- Add to Plan -->
    <button class="btn btn-accent w-full mb-lg" id="btn-add-to-plan">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Agregar al plan semanal
    </button>

    <!-- Ingredients -->
    ${ingredientes.length > 0 ? `
      <div class="recipe-section">
        <h2 class="recipe-section-title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 2C6.48 2 2 6 2 10c0 2.5 1.5 4.8 4 6.5V22l4-2 4 2v-5.5c2.5-1.7 4-4 4-6.5 0-4-4.48-8-6-8z"/></svg>Ingredientes</h2>
        <div class="ingredient-list">${ingredientList}</div>
      </div>` : ''}

    <!-- Instructions -->
    ${steps.length > 0 ? `
      <div class="recipe-section">
        <h2 class="recipe-section-title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Preparación</h2>
        ${stepsHtml}
      </div>` : ''}

    <button class="btn btn-ghost w-full mt-lg" onclick="window.location.hash='/recetas'">← Volver a recetas</button>
  `;
}
