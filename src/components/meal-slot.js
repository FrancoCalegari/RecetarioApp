/* ═══════════════════════════════════════════════════════════════════
   Meal Slot Component — Used in the weekly planner
   ═══════════════════════════════════════════════════════════════════ */

export const MOMENTOS = [
  { key: 'desayuno',    label: 'Desayuno',    icon: '🌅', color: '#F6A623' },
  { key: 'almuerzo',    label: 'Almuerzo',    icon: '🍽️', color: '#E8734A' },
  { key: 'media_tarde', label: 'Media Tarde', icon: '☕', color: '#B07CD8' },
  { key: 'cena',        label: 'Cena',        icon: '🌙', color: '#5B8DEF' },
  { key: 'picaditas',   label: 'Picaditas',   icon: '🍿', color: '#4CAF7D' },
];

/**
 * Render a meal slot
 * @param {Object} opts
 * @param {string} opts.momento - Moment key (desayuno, almuerzo, etc.)
 * @param {string} opts.fecha - Date string YYYY-MM-DD
 * @param {Object|null} opts.plan - Plan data if assigned
 * @param {Object|null} opts.receta - Recipe data if assigned
 */
export function renderMealSlot({ momento, fecha, plan, receta }) {
  const config = MOMENTOS.find((m) => m.key === momento);
  if (!config) return '';

  const filled = plan && (receta || plan.nota);
  const display = receta ? receta.nombre : plan?.nota || '';

  return `
    <div class="meal-slot ${filled ? 'filled' : ''}" 
         onclick="window.dispatchEvent(new CustomEvent('meal-slot-click', { detail: { momento: '${momento}', fecha: '${fecha}', planId: ${plan?.id || 'null'} }}))"
         id="slot-${fecha}-${momento}">
      <div class="meal-slot-icon" style="background: ${config.color}20; color: ${config.color};">
        ${config.icon}
      </div>
      <div class="meal-slot-content">
        <div class="meal-slot-label">${config.label}</div>
        ${filled
          ? `<div class="meal-slot-value">${display}</div>`
          : `<div class="meal-slot-empty">Toca para agregar</div>`
        }
      </div>
      ${filled ? `
        <div class="meal-slot-actions">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('meal-slot-remove', { detail: { planId: ${plan.id} } }))" title="Quitar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// renderExtrasSection removed — Picaditas slot (🍿) handles snacks/extras natively

