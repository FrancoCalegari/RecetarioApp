/* ═══════════════════════════════════════════════════════════════════
   Home / Dashboard View
   ═══════════════════════════════════════════════════════════════════ */

import { select } from '../lib/api.js';
import { MOMENTOS } from '../components/meal-slot.js';

function getToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function getDayName(dateStr) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días!';
  if (h < 18) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

export async function renderHome() {
  const today = getToday();

  // Fetch data in parallel
  let recetasCount = 0;
  let ingredientesCount = 0;
  let todayPlan = [];
  let todayExtras = [];

  try {
    const [recRes, ingRes, planRes, extRes] = await Promise.all([
      select(`SELECT COUNT(*) as total FROM recetas`),
      select(`SELECT COUNT(*) as total FROM ingredientes`),
      select(`SELECT ps.*, r.nombre as receta_nombre FROM planificacion_semanal ps LEFT JOIN recetas r ON ps.receta_id = r.id WHERE ps.fecha = '${today}' ORDER BY FIELD(ps.momento, 'desayuno', 'almuerzo', 'media_tarde', 'cena', 'picaditas')`),
      select(`SELECT * FROM registro_extras WHERE fecha = '${today}'`),
    ]);

    recetasCount = recRes?.[0]?.total || 0;
    ingredientesCount = ingRes?.[0]?.total || 0;
    todayPlan = planRes || [];
    todayExtras = extRes || [];
  } catch (e) {
    console.warn('Home data fetch error:', e);
  }

  // Today's meals
  const todayMeals = MOMENTOS.map((m) => {
    const plan = todayPlan.find((p) => p.momento === m.key);
    const display = plan ? (plan.receta_nombre || plan.nota || '—') : null;
    return `
      <div class="meal-slot ${plan ? 'filled' : ''}" onclick="window.location.hash='/planificador'" style="cursor:pointer">
        <div class="meal-slot-icon" style="background: ${m.color}20; color: ${m.color};">
          ${m.icon}
        </div>
        <div class="meal-slot-content">
          <div class="meal-slot-label">${m.label}</div>
          ${display
            ? `<div class="meal-slot-value">${display}</div>`
            : `<div class="meal-slot-empty">Sin asignar</div>`}
        </div>
      </div>
    `;
  }).join('');

  // Extras
  const extrasHtml = todayExtras.length > 0
    ? todayExtras.map((e) => `<div class="extra-item"><span>${e.descripcion}</span><span class="text-xs text-muted">${e.momento || ''}</span></div>`).join('')
    : '<p class="text-sm text-muted" style="padding:8px 0;">Sin extras hoy</p>';

  return `
    <!-- Greeting -->
    <div style="margin-bottom: var(--space-xl);">
      <h1 class="heading-xl">${getGreeting()} 👨‍🍳</h1>
      <p class="text-secondary mt-sm">${getDayName(today)}, ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</p>
    </div>

    <!-- Stats -->
    <div class="grid-2 mb-lg">
      <div class="stat-card" onclick="window.location.hash='/recetas'" style="cursor:pointer">
        <div class="stat-value">${recetasCount}</div>
        <div class="stat-label">Recetas</div>
      </div>
      <div class="stat-card" onclick="window.location.hash='/ingredientes'" style="cursor:pointer">
        <div class="stat-value">${ingredientesCount}</div>
        <div class="stat-label">Ingredientes</div>
      </div>
    </div>

    <!-- Today's Plan -->
    <div class="section-header">
      <h2 class="heading-md">🗓️ Hoy</h2>
      <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/planificador'">Ver semana →</button>
    </div>
    <div class="day-slots mb-lg">
      ${todayMeals}
    </div>

    <!-- Today's Extras -->
    <div class="extras-section">
      <div class="extras-title">
        🍕 Extras de hoy
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" 
                onclick="window.location.hash='/planificador'"
                id="home-view-extras">
          Ver más →
        </button>
      </div>
      ${extrasHtml}
    </div>

    <!-- Quick Actions -->
    <div style="margin-top: var(--space-xl);">
      <h2 class="heading-md mb-md">Acciones rápidas</h2>
      <div class="flex flex-col gap-sm">
        <button class="btn btn-primary w-full" onclick="window.location.hash='/receta/nueva'" id="home-new-recipe">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva Receta
        </button>
        <button class="btn btn-secondary w-full" onclick="window.location.hash='/planificador'" id="home-plan-week">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Planificar Semana
        </button>
      </div>
    </div>
  `;
}
