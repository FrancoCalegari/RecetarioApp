/* ═══════════════════════════════════════════════════════════════════
   Planificador Semanal View — Weekly meal planner
   ═══════════════════════════════════════════════════════════════════ */

import { select, insert, remove } from '../lib/api.js';
import { renderMealSlot, MOMENTOS } from '../components/meal-slot.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { getUser, isLoggedIn } from '../lib/auth.js';

let currentWeekStart = null;
let weekData = { plans: [], recetas: [] };

// AbortController para limpiar event listeners al navegar
let abortController = new AbortController();

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function getWeekDates(monday) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Normaliza fechas que el backend puede devolver como '2025-04-20T00:00:00.000Z'
function normalizeDate(dateVal) {
  if (!dateVal) return '';
  return String(dateVal).substring(0, 10);
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

async function loadWeekData() {
  const user = getUser();
  const userId = user?.id;
  if (!userId) {
    weekData = { plans: [], recetas: [] };
    return;
  }

  const dates = getWeekDates(currentWeekStart);
  const startDate = formatDate(dates[0]);
  const endDate = formatDate(dates[6]);

  try {
    const [plans, recetas] = await Promise.all([
      // FIX 1: Filtrar por usuario + rango de fechas
      select(
        `SELECT ps.*, r.nombre as receta_nombre
         FROM planificacion_semanal ps
         LEFT JOIN recetas r ON ps.receta_id = r.id
         WHERE ps.usuario_id = ${userId}
           AND ps.fecha >= '${startDate}'
           AND ps.fecha <= '${endDate}'
         ORDER BY ps.fecha`
      ),
      // FIX 2: Cargar recetas del usuario + recetas públicas
      select(
        `SELECT id, nombre FROM recetas
         WHERE autor_id = ${userId} OR privacidad = 'publico'
         ORDER BY nombre`
      ),
    ]);

    weekData = {
      plans: (plans || []).map((p) => ({ ...p, fecha: normalizeDate(p.fecha) })),
      recetas: recetas || [],
    };
  } catch (e) {
    console.warn('Error loading week data:', e);
    weekData = { plans: [], recetas: [] };
  }
}

function renderWeekContent() {
  const container = document.getElementById('week-content');
  if (!container) return;

  const dates = getWeekDates(currentWeekStart);
  const today = formatDate(new Date());

  if (weekData.recetas.length === 0 && weekData.plans.length === 0) {
    // Show helpful empty state but still render the week grid
  }

  const daysHtml = dates.map((date, i) => {
    const dateStr = formatDate(date);
    const isToday = dateStr === today;

    // FIX 3: comparar con normalizeDate para tolerar timestamps del backend
    const dayPlans = weekData.plans.filter((p) => normalizeDate(p.fecha) === dateStr);

    const slotsHtml = MOMENTOS.map((m) => {
      const plan = dayPlans.find((p) => p.momento === m.key);
      const receta = plan && plan.receta_nombre ? { nombre: plan.receta_nombre } : null;
      return renderMealSlot({ momento: m.key, fecha: dateStr, plan, receta });
    }).join('');

    return `
      <div class="day-column">
        <div class="day-header ${isToday ? 'today' : ''}">
          <span>${DAY_NAMES[i]}</span>
          <span class="day-header-date">${date.getDate()} ${MONTH_NAMES[date.getMonth()]}</span>
          ${isToday ? '<span class="tag tag-primary" style="margin-left:auto;font-size:0.7rem;">HOY</span>' : ''}
        </div>
        <div class="day-slots">
          ${slotsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = daysHtml;
}

function updateWeekTitle() {
  const el = document.getElementById('week-title');
  if (!el) return;
  const dates = getWeekDates(currentWeekStart);
  const start = dates[0];
  const end = dates[6];
  if (start.getMonth() === end.getMonth()) {
    el.textContent = `${start.getDate()} - ${end.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
  } else {
    el.textContent = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} - ${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
  }
}

function showAssignModal(fecha, momento) {
  const user = getUser();
  const config = MOMENTOS.find((m) => m.key === momento);

  const recetaOptions = weekData.recetas.map((r) =>
    `<option value="${r.id}">${r.nombre}</option>`
  ).join('');

  const noRecipes = weekData.recetas.length === 0
    ? `<p class="text-xs text-muted" style="margin-top:-8px;">
        Aún no tenés recetas.
        <a href="#" onclick="closeModal();window.location.hash='/receta/nueva'" style="color:var(--primary);">Crear una</a>
      </p>`
    : '';

  openModal({
    title: `${config?.icon || ''} ${config?.label || momento}`,
    content: `
      <p class="text-sm text-muted mb-md">${fecha}</p>
      <div class="flex flex-col gap-md">
        <div class="form-group">
          <label class="form-label">Elegir receta</label>
          <select class="form-input" id="assign-receta">
            <option value="">Sin receta (nota libre)</option>
            ${recetaOptions}
          </select>
          ${noRecipes}
        </div>
        <div class="form-group">
          <label class="form-label">O escribir nota</label>
          <input type="text" class="form-input" id="assign-nota" placeholder="Ej: Pizza del delivery" />
        </div>
        <button class="btn btn-accent w-full" id="btn-confirm-assign">Asignar</button>
      </div>
    `,
  });

  setTimeout(() => {
    document.getElementById('btn-confirm-assign')?.addEventListener('click', async () => {
      const recetaId = document.getElementById('assign-receta')?.value || null;
      const nota = document.getElementById('assign-nota')?.value?.trim() || null;

      if (!recetaId && !nota) return showToast('Elegí una receta o escribí una nota', 'error');

      try {
        // FIX 4: incluir usuario_id en el insert
        await insert('planificacion_semanal', {
          fecha,
          momento,
          usuario_id: user?.id,
          receta_id: recetaId || null,
          nota: nota || null,
        });
        closeModal();
        showToast('Comida asignada ✓', 'success');
        await loadWeekData();
        renderWeekContent();
      } catch (e) {
        console.error('Error assigning plan:', e);
        showToast(`Error al asignar: ${e.message}`, 'error');
      }
    });
  }, 100);
}

async function refreshWeek() {
  await loadWeekData();
  updateWeekTitle();
  renderWeekContent();
}

function bindEvents() {
  // FIX 5: Abortar listeners anteriores para evitar duplicados
  abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  document.getElementById('btn-prev-week')?.addEventListener('click', async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    await refreshWeek();
  }, { signal });

  document.getElementById('btn-next-week')?.addEventListener('click', async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    await refreshWeek();
  }, { signal });

  document.getElementById('btn-today-week')?.addEventListener('click', async () => {
    currentWeekStart = getMonday(new Date());
    await refreshWeek();
  }, { signal });

  window.addEventListener('meal-slot-click', (e) => {
    const { momento, fecha } = e.detail;
    showAssignModal(fecha, momento);
  }, { signal });

  // FIX 6: usar remove() en vez de select() para DELETE
  window.addEventListener('meal-slot-remove', async (e) => {
    const { planId } = e.detail;
    if (!planId) return;
    try {
      await remove('planificacion_semanal', planId);
      showToast('Comida removida', 'success');
      await loadWeekData();
      renderWeekContent();
    } catch (err) {
      showToast('Error al remover', 'error');
    }
  }, { signal });
}

export async function renderPlanificador() {
  if (!isLoggedIn()) {
    return `
      <div class="empty-state">
        <div style="font-size:3rem; margin-bottom:var(--space-md);">📅</div>
        <h2 class="heading-md mb-sm">Planificador semanal</h2>
        <p class="text-sm text-secondary mb-lg">Iniciá sesión para planificar tus comidas de la semana</p>
        <button class="btn btn-primary" onclick="window.location.hash='/login'">Iniciar sesión</button>
      </div>`;
  }

  currentWeekStart = getMonday(new Date());
  await loadWeekData();

  setTimeout(() => {
    updateWeekTitle();
    renderWeekContent();
    bindEvents();
  }, 50);

  return `
    <div class="section-header">
      <h1 class="heading-lg">📅 Planificador</h1>
    </div>

    <!-- Week Navigation -->
    <div class="week-nav">
      <button class="btn btn-ghost btn-icon" id="btn-prev-week" title="Semana anterior">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style="text-align:center;">
        <div class="week-nav-title" id="week-title">...</div>
        <button class="btn btn-ghost btn-sm text-xs" id="btn-today-week">Ir a hoy</button>
      </div>
      <button class="btn btn-ghost btn-icon" id="btn-next-week" title="Semana siguiente">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- Week Content -->
    <div id="week-content">
      <div class="empty-state">
        <div class="loading-spinner"></div>
        <p class="text-sm text-muted mt-sm">Cargando semana...</p>
      </div>
    </div>
  `;
}
