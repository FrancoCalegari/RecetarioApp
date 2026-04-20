/* ═══════════════════════════════════════════════════════════════════
   Meal Section Component — Supports MULTIPLE recipes per time slot
   ═══════════════════════════════════════════════════════════════════ */

export const MOMENTOS = [
  { key: 'desayuno',    label: 'Desayuno',    icon: '🌅', color: '#F6A623' },
  { key: 'almuerzo',    label: 'Almuerzo',    icon: '🍽️', color: '#E8734A' },
  { key: 'media_tarde', label: 'Media Tarde', icon: '☕', color: '#B07CD8' },
  { key: 'cena',        label: 'Cena',        icon: '🌙', color: '#5B8DEF' },
  { key: 'picaditas',   label: 'Picaditas',   icon: '🍿', color: '#4CAF7D' },
];

/**
 * Render a meal section with MULTIPLE recipes per slot
 * @param {string} fecha - Date string YYYY-MM-DD
 * @param {string} momento - Moment key
 * @param {Array} plans - All plans for this fecha+momento
 */
export function renderMealSection(fecha, momento, plans = []) {
  const config = MOMENTOS.find((m) => m.key === momento);
  if (!config) return '';

  const hasPlans = plans.length > 0;

  const planItems = plans.map((plan) => {
    const display = plan.receta_nombre || plan.nota || '—';
    return `
      <div class="meal-item" id="meal-item-${plan.id}">
        <span class="meal-item-dot" style="background:${config.color};"></span>
        <span class="meal-item-name">${display}</span>
        <button class="meal-item-remove" 
          onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('meal-slot-remove', { detail: { planId: ${plan.id} } }))"
          title="Quitar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  return `
    <div class="meal-section ${hasPlans ? 'has-plans' : ''}" id="slot-${fecha}-${momento}">
      <div class="meal-section-header"
           onclick="window.dispatchEvent(new CustomEvent('meal-slot-click', { detail: { momento: '${momento}', fecha: '${fecha}' } }))">
        <div class="meal-section-icon" style="background:${config.color}20; color:${config.color};">
          ${config.icon}
        </div>
        <span class="meal-section-label">${config.label}</span>
        <button class="meal-section-add" title="Agregar receta"
          onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('meal-slot-click', { detail: { momento: '${momento}', fecha: '${fecha}' } }))">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      ${hasPlans ? `<div class="meal-items-list">${planItems}</div>` : ''}
    </div>`;
}
