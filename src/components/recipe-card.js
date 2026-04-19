/* ═══════════════════════════════════════════════════════════════════
   Recipe Card Component
   ═══════════════════════════════════════════════════════════════════ */

import { getFileUrl } from '../lib/api.js';

/**
 * Render a recipe card
 * @param {Object} recipe - Recipe data
 * @param {Object} opts - Options { showIngredients: bool }
 */
export function renderRecipeCard(recipe, opts = {}) {
  const imageUrl = getFileUrl(recipe.imagen_file_id);
  const imageHtml = imageUrl
    ? `<img class="card-image" src="${imageUrl}" alt="${recipe.nombre}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-image-placeholder\\'>🍽️</div>'">`
    : `<div class="card-image-placeholder">🍽️</div>`;

  const timeTag = recipe.tiempo_preparacion
    ? `<span class="tag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${recipe.tiempo_preparacion} min</span>`
    : '';

  const portionsTag = recipe.porciones
    ? `<span class="tag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${recipe.porciones}</span>`
    : '';

  const ingredientTags = opts.showIngredients && recipe.ingredientes
    ? `<div class="flex flex-wrap gap-xs mt-sm">
        ${recipe.ingredientes.slice(0, 4).map((ing) =>
          `<span class="tag tag-accent">${ing.nombre}</span>`
        ).join('')}
        ${recipe.ingredientes.length > 4 ? `<span class="tag">+${recipe.ingredientes.length - 4}</span>` : ''}
      </div>`
    : '';

  return `
    <article class="card" onclick="window.location.hash='/receta/${recipe.id}'" style="cursor:pointer" id="recipe-card-${recipe.id}">
      ${imageHtml}
      <div class="card-body">
        <h3 class="heading-sm" style="margin-bottom: 6px;">${recipe.nombre}</h3>
        ${recipe.descripcion ? `<p class="text-sm text-secondary truncate">${recipe.descripcion}</p>` : ''}
        <div class="flex flex-wrap gap-xs mt-sm">
          ${timeTag}
          ${portionsTag}
        </div>
        ${ingredientTags}
      </div>
    </article>
  `;
}
