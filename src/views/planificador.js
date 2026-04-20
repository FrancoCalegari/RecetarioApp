/* ═══════════════════════════════════════════════════════════════════
   Planificador View — Weekly planner + consumption stats
   ═══════════════════════════════════════════════════════════════════ */

import { select, insert, remove, esc } from '../lib/api.js';
import { renderMealSection, MOMENTOS } from '../components/meal-slot.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { getUser, isLoggedIn } from '../lib/auth.js';

let currentWeekStart = null;
let weekData = { plans: [], recetas: [] };
let statsData = [];
let activeTab = 'week'; // 'week' | 'stats'
let abortController = new AbortController();

// ─── Date Helpers ─────────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatDate(d) { return d.toISOString().split('T')[0]; }
function normalizeDate(v) { return v ? String(v).substring(0, 10) : ''; }

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const DAY_NAMES   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ─── Data Loading ──────────────────────────────────────────────────────
async function loadWeekData() {
  const user = getUser();
  if (!user?.id) { weekData = { plans: [], recetas: [] }; return; }

  const dates = getWeekDates(currentWeekStart);
  const startDate = formatDate(dates[0]);
  const endDate   = formatDate(dates[6]);

  try {
    const [plans, recetas] = await Promise.all([
      select(
        `SELECT ps.*, r.nombre as receta_nombre
         FROM planificacion_semanal ps
         LEFT JOIN recetas r ON ps.receta_id = r.id
         WHERE ps.usuario_id = ${user.id}
           AND ps.fecha >= '${startDate}' AND ps.fecha <= '${endDate}'
         ORDER BY ps.fecha, ps.id`
      ),
      select(
        `SELECT id, nombre FROM recetas
         WHERE autor_id = ${user.id} OR privacidad = 'publico'
         ORDER BY nombre`
      ),
    ]);
    weekData = {
      plans:   (plans || []).map((p) => ({ ...p, fecha: normalizeDate(p.fecha) })),
      recetas: recetas || [],
    };
  } catch (e) {
    console.warn('loadWeekData error:', e);
    weekData = { plans: [], recetas: [] };
  }
}

async function loadStats(period = 'all') {
  const user = getUser();
  if (!user?.id) { statsData = []; return; }

  let dateFilter = '';
  if (period === 'week') {
    const dates = getWeekDates(currentWeekStart);
    dateFilter = `AND ps.fecha >= '${formatDate(dates[0])}' AND ps.fecha <= '${formatDate(dates[6])}'`;
  } else if (period === 'month') {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
    dateFilter = `AND ps.fecha >= '${y}-${m}-01' AND ps.fecha <= '${y}-${m}-31'`;
  }

  try {
    statsData = await select(
      `SELECT ps.receta_id, r.nombre as receta_nombre, ps.momento, COUNT(*) as veces
       FROM planificacion_semanal ps
       LEFT JOIN recetas r ON ps.receta_id = r.id
       WHERE ps.usuario_id = ${user.id} AND ps.receta_id IS NOT NULL ${dateFilter}
       GROUP BY ps.receta_id, ps.momento
       ORDER BY veces DESC
       LIMIT 30`
    ) || [];
  } catch (e) {
    console.warn('loadStats error:', e);
    statsData = [];
  }
}

// ─── Render Week ───────────────────────────────────────────────────────
function renderWeekContent() {
  const container = document.getElementById('week-content');
  if (!container) return;

  const dates = getWeekDates(currentWeekStart);
  const today = formatDate(new Date());

  const html = dates.map((date, i) => {
    const dateStr  = formatDate(date);
    const isToday  = dateStr === today;
    const dayPlans = weekData.plans.filter((p) => normalizeDate(p.fecha) === dateStr);

    const sectionsHtml = MOMENTOS.map((m) => {
      const slotPlans = dayPlans.filter((p) => p.momento === m.key);
      return renderMealSection(dateStr, m.key, slotPlans);
    }).join('');

    return `
      <div class="day-column">
        <div class="day-header ${isToday ? 'today' : ''}">
          <span>${DAY_NAMES[i]}</span>
          <span class="day-header-date">${date.getDate()} ${MONTH_NAMES[date.getMonth()]}</span>
          ${isToday ? '<span class="tag tag-primary" style="margin-left:auto;font-size:0.7rem;">HOY</span>' : ''}
        </div>
        <div class="day-slots">${sectionsHtml}</div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

// ─── Render Stats ──────────────────────────────────────────────────────
function renderStatsContent(period = 'all') {
  const container = document.getElementById('week-content');
  if (!container) return;

  if (statsData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2.5rem;margin-bottom:var(--space-md);">📊</div>
        <div class="empty-state-title">Sin datos todavía</div>
        <div class="empty-state-text">Asigná recetas a días en el planificador para ver tus estadísticas de consumo.</div>
      </div>`;
    return;
  }

  // Aggregate: group by recipe (sum across all momentos)
  const byReceta = {};
  statsData.forEach((row) => {
    const key = row.receta_id;
    if (!byReceta[key]) byReceta[key] = { nombre: row.receta_nombre || '(nota)', total: 0, por_momento: {} };
    byReceta[key].total += Number(row.veces);
    byReceta[key].por_momento[row.momento] = (byReceta[key].por_momento[row.momento] || 0) + Number(row.veces);
  });

  const sorted = Object.values(byReceta).sort((a, b) => b.total - a.total).slice(0, 15);
  const maxVal = sorted[0]?.total || 1;

  const momentoColors = Object.fromEntries(MOMENTOS.map((m) => [m.key, m.color]));
  const momentoIcons  = Object.fromEntries(MOMENTOS.map((m) => [m.key, m.icon]));

  const barsHtml = sorted.map((recipe, idx) => {
    const pct = Math.round((recipe.total / maxVal) * 100);
    const segmentsHtml = MOMENTOS.map((m) => {
      const v = recipe.por_momento[m.key] || 0;
      if (!v) return '';
      const segPct = Math.round((v / recipe.total) * 100);
      return `<div class="stats-bar-segment" style="width:${segPct}%;background:${m.color};" title="${m.label}: ${v}x"></div>`;
    }).join('');

    const momentoBadges = MOMENTOS
      .filter((m) => recipe.por_momento[m.key])
      .map((m) => `<span title="${m.label} (${recipe.por_momento[m.key]}x)" style="font-size:1rem;">${m.icon}</span>`)
      .join('');

    return `
      <div class="stats-bar-row">
        <div class="stats-bar-meta">
          <div class="stats-bar-rank">${idx + 1}</div>
          <div class="stats-bar-info">
            <div class="stats-bar-name">${recipe.nombre}</div>
            <div class="stats-bar-moments">${momentoBadges}</div>
          </div>
          <div class="stats-bar-count">${recipe.total}×</div>
        </div>
        <div class="stats-bar-track">
          <div class="stats-bar-fill" style="width:${pct}%;">
            ${segmentsHtml}
          </div>
        </div>
      </div>`;
  }).join('');

  // Leyenda de momentos
  const leyendaHtml = MOMENTOS.map((m) =>
    `<div class="stats-legend-item">
      <div class="stats-legend-dot" style="background:${m.color};"></div>
      <span>${m.icon} ${m.label}</span>
    </div>`
  ).join('');

  container.innerHTML = `
    <div class="stats-container">
      <!-- Period filter -->
      <div class="stats-period-tabs">
        <button class="stats-period-btn ${period === 'week' ? 'active' : ''}" onclick="window._plannerSetPeriod('week')">Esta semana</button>
        <button class="stats-period-btn ${period === 'month' ? 'active' : ''}" onclick="window._plannerSetPeriod('month')">Este mes</button>
        <button class="stats-period-btn ${period === 'all' ? 'active' : ''}" onclick="window._plannerSetPeriod('all')">Todo</button>
      </div>

      <div class="stats-heading">
        <div class="heading-sm">🏆 Recetas más consumidas</div>
        <div class="text-xs text-muted">${sorted.length} recetas planificadas</div>
      </div>

      <div class="stats-legend">${leyendaHtml}</div>

      <div class="stats-bar-chart">${barsHtml}</div>

      <p class="text-xs text-muted text-center" style="margin-top:var(--space-lg);">
        🔒 Estadísticas privadas · Solo vos las ves
      </p>
    </div>`;
}

function updateWeekTitle() {
  const el = document.getElementById('week-title');
  if (!el) return;
  const dates = getWeekDates(currentWeekStart);
  const s = dates[0], e = dates[6];
  el.textContent = s.getMonth() === e.getMonth()
    ? `${s.getDate()} - ${e.getDate()} ${MONTH_NAMES[s.getMonth()]}`
    : `${s.getDate()} ${MONTH_NAMES[s.getMonth()]} - ${e.getDate()} ${MONTH_NAMES[e.getMonth()]}`;
}

// ─── Assign Modal ──────────────────────────────────────────────────────
function showAssignModal(fecha, momento) {
  const user = getUser();
  const config = MOMENTOS.find((m) => m.key === momento);

  const recetaOptions = weekData.recetas.map((r) =>
    `<option value="${r.id}">${r.nombre}</option>`
  ).join('');

  const dayFormatted = (() => {
    const [y, mo, d] = fecha.split('-');
    const dn = new Date(fecha).getDay();
    const names = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return `${names[dn]} ${d}/${mo}/${y}`;
  })();

  openModal({
    title: `${config?.icon || ''} ${config?.label || momento}`,
    content: `
      <p class="text-sm text-muted mb-md">${dayFormatted}</p>
      <div class="flex flex-col gap-md">
        <div class="form-group">
          <label class="form-label">Elegir receta</label>
          <select class="form-input" id="assign-receta">
            <option value="">— Solo nota libre —</option>
            ${recetaOptions}
          </select>
          ${weekData.recetas.length === 0
            ? `<p class="text-xs text-muted mt-sm">
                Sin recetas aún. <a onclick="closeModal?.();window.location.hash='/receta/nueva'" style="color:var(--primary);cursor:pointer;">Crear una</a>
              </p>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">O nota libre</label>
          <input type="text" class="form-input" id="assign-nota" placeholder="Ej: Pizza del delivery" />
        </div>
        <button class="btn btn-accent w-full" id="btn-confirm-assign">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>
          Agregar a ${config?.label}
        </button>
      </div>`,
  });

  setTimeout(() => {
    document.getElementById('btn-confirm-assign')?.addEventListener('click', async () => {
      const recetaId = document.getElementById('assign-receta')?.value || null;
      const nota     = document.getElementById('assign-nota')?.value?.trim() || null;
      if (!recetaId && !nota) return showToast('Elegí una receta o escribí una nota', 'error');
      try {
        await insert('planificacion_semanal', {
          fecha, momento,
          usuario_id: user?.id,
          receta_id: recetaId || null,
          nota: nota || null,
        });
        closeModal();
        showToast(`Agregado a ${config?.label} ✓`, 'success');
        await loadWeekData();
        renderWeekContent();
      } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
      }
    });
  }, 100);
}

// ─── Event Binding ─────────────────────────────────────────────────────
function bindEvents() {
  abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  const refreshWeek = async () => { await loadWeekData(); updateWeekTitle(); renderWeekContent(); };

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

  document.getElementById('tab-week')?.addEventListener('click', async () => {
    activeTab = 'week';
    document.getElementById('tab-week')?.classList.add('active');
    document.getElementById('tab-stats')?.classList.remove('active');
    document.getElementById('week-nav-bar')?.style?.setProperty('display', 'flex');
    await loadWeekData();
    updateWeekTitle();
    renderWeekContent();
  }, { signal });

  document.getElementById('tab-stats')?.addEventListener('click', async () => {
    activeTab = 'stats';
    document.getElementById('tab-stats')?.classList.add('active');
    document.getElementById('tab-week')?.classList.remove('active');
    document.getElementById('week-nav-bar')?.style?.setProperty('display', 'none');
    await loadStats('all');
    renderStatsContent('all');
  }, { signal });

  window.addEventListener('meal-slot-click', (e) => {
    const { momento, fecha } = e.detail;
    showAssignModal(fecha, momento);
  }, { signal });

  window.addEventListener('meal-slot-remove', async (e) => {
    const { planId } = e.detail;
    if (!planId) return;
    try {
      await remove('planificacion_semanal', planId);
      showToast('Quitado ✓', 'success');
      await loadWeekData();
      renderWeekContent();
    } catch (err) {
      showToast('Error al quitar', 'error');
    }
  }, { signal });

  // Period filter handler (called from inline onclick)
  window._plannerSetPeriod = async (period) => {
    await loadStats(period);
    renderStatsContent(period);
  };
}

// ─── Main Render ───────────────────────────────────────────────────────
export async function renderPlanificador() {
  if (!isLoggedIn()) {
    return `
      <div class="empty-state">
        <div style="font-size:3rem;margin-bottom:var(--space-md);">📅</div>
        <h2 class="heading-md mb-sm">Planificador semanal</h2>
        <p class="text-sm text-secondary mb-lg">Iniciá sesión para planificar tus comidas</p>
        <button class="btn btn-primary" onclick="window.location.hash='/login'">Iniciar sesión</button>
      </div>`;
  }

  currentWeekStart = getMonday(new Date());
  activeTab = 'week';
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

    <!-- Tabs -->
    <div class="planner-tabs">
      <button class="planner-tab active" id="tab-week">📅 Semana</button>
      <button class="planner-tab" id="tab-stats">📊 Estadísticas</button>
    </div>

    <!-- Week Navigation -->
    <div class="week-nav" id="week-nav-bar">
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

    <!-- Content area (week or stats) -->
    <div id="week-content">
      <div class="empty-state">
        <div class="loading-spinner"></div>
        <p class="text-sm text-muted mt-sm">Cargando...</p>
      </div>
    </div>
  `;
}
