/* ═══════════════════════════════════════════════════════════════════
   Recetas List View — Browse, search, filter recipes
   ═══════════════════════════════════════════════════════════════════ */

import { select } from '../lib/api.js';
import { renderRecipeCard } from '../components/recipe-card.js';

let allRecetas = [];
let allIngredientes = [];
let selectedIngredients = new Set();
let searchQuery = '';

async function loadData() {
  try {
    const [recetas, ingredientes] = await Promise.all([
      select('SELECT * FROM recetas ORDER BY created_at DESC'),
      select('SELECT * FROM ingredientes ORDER BY nombre'),
    ]);
    allRecetas = recetas || [];
    allIngredientes = ingredientes || [];

    // Load ingredients for each recipe
    if (allRecetas.length > 0) {
      const recipeIds = allRecetas.map((r) => r.id).join(',');
      const ri = await select(
        `SELECT ri.receta_id, i.id, i.nombre FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id WHERE ri.receta_id IN (${recipeIds})`
      );
      const riMap = {};
      (ri || []).forEach((row) => {
        if (!riMap[row.receta_id]) riMap[row.receta_id] = [];
        riMap[row.receta_id].push(row);
      });
      allRecetas.forEach((r) => {
        r.ingredientes = riMap[r.id] || [];
      });
    }
  } catch (e) {
    console.warn('Error loading recipes:', e);
  }
}

function getFilteredRecetas() {
  let results = allRecetas;

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    results = results.filter((r) =>
      r.nombre.toLowerCase().includes(q) ||
      (r.descripcion && r.descripcion.toLowerCase().includes(q))
    );
  }

  // Ingredient filter
  if (selectedIngredients.size > 0) {
    results = results.filter((r) => {
      const recipeIngIds = (r.ingredientes || []).map((i) => i.id);
      return [...selectedIngredients].every((id) => recipeIngIds.includes(id));
    });
  }

  return results;
}

function renderContent() {
  const filtered = getFilteredRecetas();

  const container = document.getElementById('recetas-content');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <div class="empty-state-title">${searchQuery || selectedIngredients.size > 0 ? 'No se encontraron recetas' : 'Sin recetas aún'}</div>
        <div class="empty-state-text">${searchQuery || selectedIngredients.size > 0 ? 'Probá con otros filtros' : 'Empezá agregando tu primera receta'}</div>
        ${!searchQuery && selectedIngredients.size === 0 ? '<button class="btn btn-primary mt-md" onclick="window.location.hash=\'/receta/nueva\'">+ Nueva Receta</button>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="grid-cards">
      ${filtered.map((r) => renderRecipeCard(r, { showIngredients: true })).join('')}
    </div>
  `;
}

function bindEvents() {
  // Search
  const searchInput = document.getElementById('recetas-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderContent();
    });
  }

  // Ingredient chips
  document.querySelectorAll('.chip[data-ingredient-id]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = parseInt(chip.dataset.ingredientId);
      if (selectedIngredients.has(id)) {
        selectedIngredients.delete(id);
        chip.classList.remove('active');
      } else {
        selectedIngredients.add(id);
        chip.classList.add('active');
      }
      renderContent();
    });
  });
}

export async function renderRecetas() {
  selectedIngredients.clear();
  searchQuery = '';

  await loadData();

  // Build ingredient chips for filter
  const categorized = {};
  allIngredientes.forEach((ing) => {
    const cat = ing.categoria || 'Otros';
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(ing);
  });

  const ingredientChips = allIngredientes.length > 0
    ? `<div class="chip-group mb-md" id="ingredient-filters">
        ${allIngredientes.slice(0, 20).map((ing) =>
          `<button class="chip" data-ingredient-id="${ing.id}">${ing.nombre}</button>`
        ).join('')}
      </div>`
    : '';

  const html = `
    <div class="section-header">
      <h1 class="heading-lg">📖 Recetas</h1>
      <button class="btn btn-primary btn-sm" onclick="window.location.hash='/receta/nueva'" id="btn-new-recipe">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva
      </button>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <div class="search-bar-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <input type="text" id="recetas-search" placeholder="Buscar recetas..." />
    </div>

    <!-- Ingredient Filters -->
    ${ingredientChips ? `<p class="text-sm text-muted mb-sm">Filtrar por ingredientes:</p>${ingredientChips}` : ''}

    <!-- Results -->
    <div id="recetas-content">
      <div class="empty-state"><div class="loading-spinner"></div><p class="text-sm text-muted mt-sm">Cargando...</p></div>
    </div>
  `;

  // Render content after DOM update
  setTimeout(() => {
    renderContent();
    bindEvents();
  }, 50);

  return html;
}
