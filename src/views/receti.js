/* ═══════════════════════════════════════════════════════════════════
   Receti AI View — Generate recipes with Gemini via the Receti bot
   ═══════════════════════════════════════════════════════════════════ */

import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';
import { isLoggedIn } from '../lib/auth.js';

const PROMPT_EXAMPLES = [
  '🥩 Milanesas napolitanas para 4 personas',
  '🥗 Ensalada César fácil y rápida',
  '🍝 Ñoquis de papa caseros con salsa',
  '🍰 Torta de chocolate sin harina',
  '🥘 Guiso de lentejas para el invierno',
  '🍳 Revuelto gramajo clásico argentino',
  '🍕 Pizza casera con masa madre',
  '🐔 Pollo al limón en 30 minutos',
];

const RECETI_AVATAR_SVG = `
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="24" fill="url(#rg)"/>
  <defs>
    <linearGradient id="rg" x1="0" y1="0" x2="48" y2="48">
      <stop offset="0%" stop-color="#E8734A"/>
      <stop offset="100%" stop-color="#4CAF7D"/>
    </linearGradient>
  </defs>
  <!-- Chef hat -->
  <ellipse cx="24" cy="14" rx="10" ry="4" fill="white" opacity="0.9"/>
  <rect x="15" y="11" width="18" height="8" rx="2" fill="white" opacity="0.9"/>
  <ellipse cx="24" cy="10" rx="5" ry="4" fill="white"/>
  <!-- Robot face -->
  <rect x="14" y="20" width="20" height="16" rx="4" fill="#1E2832"/>
  <rect x="16" y="22" width="6" height="4" rx="1" fill="#4CAF7D"/>
  <rect x="26" y="22" width="6" height="4" rx="1" fill="#4CAF7D"/>
  <!-- Smile -->
  <rect x="18" y="29" width="12" height="3" rx="1.5" fill="#E8734A"/>
  <!-- Antenna -->
  <line x1="24" y1="7" x2="24" y2="4" stroke="white" stroke-width="2"/>
  <circle cx="24" cy="3" r="2" fill="#E8734A"/>
</svg>`;

let aiAvailable = false;
let isGenerating = false;
let lastResult = null;

async function checkAIStatus() {
  try {
    const res = await fetch('/api/ai/status');
    const data = await res.json();
    aiAvailable = data.available;
    return data;
  } catch {
    aiAvailable = false;
    return { available: false };
  }
}

function renderRecitiAvatar(size = 48) {
  return `
    <div style="width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; flex-shrink:0; box-shadow: 0 0 16px rgba(232, 115, 74, 0.4);">
      ${RECETI_AVATAR_SVG.replace('width="48"', `width="${size}"`).replace('height="48"', `height="${size}"`)}
    </div>`;
}

function renderGenerating() {
  return `
    <div class="receti-thinking" id="receti-thinking">
      <div class="receti-thinking-row">
        ${renderRecitiAvatar(40)}
        <div class="receti-bubble" style="flex:1;">
          <div class="receti-typing">
            <span></span><span></span><span></span>
          </div>
          <p class="text-xs text-muted mt-sm">Receti está cocinando tu receta con IA...</p>
        </div>
      </div>
      <div class="receti-steps" id="receti-steps">
        <div class="receti-step active" id="step-0">🧠 Analizando tu pedido...</div>
        <div class="receti-step" id="step-1">📝 Redactando ingredientes...</div>
        <div class="receti-step" id="step-2">👨‍🍳 Preparando instrucciones...</div>
        <div class="receti-step" id="step-3">💾 Guardando en la base...</div>
      </div>
    </div>`;
}

function renderResult(result) {
  const { receta, ingredientes } = result;
  const ingsHtml = ingredientes.map((ing) => `
    <div class="ingredient-item">
      <span class="ingredient-item-dot"></span>
      <span>${ing.nombre}</span>
      ${ing.cantidad ? `<span class="ingredient-item-qty">${ing.cantidad}${ing.unidad ? ' ' + ing.unidad : ''}</span>` : ''}
    </div>`).join('');

  const steps = (receta.instrucciones || '').split('\n').filter((s) => s.trim());
  const stepsHtml = steps.map((step, i) => `
    <div class="instruction-step">
      <div class="step-number">${i + 1}</div>
      <div class="step-text">${step}</div>
    </div>`).join('');

  return `
    <div class="receti-result card" id="receti-result">
      <!-- Header -->
      <div class="card-body" style="border-bottom:1px solid var(--border-subtle);">
        <div class="flex items-center gap-sm mb-sm">
          ${renderRecitiAvatar(36)}
          <div>
            <div class="text-xs text-muted">Receti generó</div>
            <div class="heading-sm">¡Lista! 🎉</div>
          </div>
        </div>
      </div>

      <!-- Recipe preview -->
      <div class="card-body">
        <div class="tag tag-accent mb-sm">🤖 Generada por Receti IA</div>
        <h2 class="heading-md mb-sm">${receta.nombre}</h2>
        ${receta.descripcion ? `<p class="text-sm text-secondary mb-md">${receta.descripcion}</p>` : ''}

        <div class="recipe-meta mb-md">
          ${receta.tiempo_preparacion ? `<div class="recipe-meta-item">⏱️ ${receta.tiempo_preparacion} min</div>` : ''}
          ${receta.porciones ? `<div class="recipe-meta-item">👥 ${receta.porciones} porciones</div>` : ''}
          <div class="recipe-meta-item">🌍 Pública</div>
        </div>

        ${ingredientes.length > 0 ? `
          <div class="recipe-section">
            <div class="heading-sm mb-sm">Ingredientes (${ingredientes.length})</div>
            <div class="ingredient-list">${ingsHtml}</div>
          </div>` : ''}

        ${steps.length > 0 ? `
          <div class="recipe-section">
            <div class="heading-sm mb-sm">Preparación</div>
            ${stepsHtml}
          </div>` : ''}
      </div>

      <!-- Actions -->
      <div class="card-body flex gap-sm" style="border-top:1px solid var(--border-subtle);">
        <button class="btn btn-secondary flex-1" id="btn-receti-new">
          ✨ Generar otra
        </button>
        <button class="btn btn-accent flex-1" id="btn-receti-view" onclick="window.location.hash='/receta/${result.recetaId}'">
          Ver receta →
        </button>
      </div>
    </div>`;
}

async function generate(prompt) {
  if (isGenerating) return;
  if (!prompt?.trim()) return showToast('Escribí qué querés cocinar', 'error');
  if (!aiAvailable) return showToast('Configurá GEMINI_API_KEY en el .env', 'error');

  isGenerating = true;
  lastResult = null;

  const resultArea = document.getElementById('receti-result-area');
  if (resultArea) resultArea.innerHTML = renderGenerating();

  // Step animation
  let step = 0;
  const stepTimer = setInterval(() => {
    document.querySelectorAll('.receti-step').forEach((el, i) => {
      el.classList.toggle('active', i <= step);
    });
    step++;
    if (step >= 4) clearInterval(stepTimer);
  }, 800);

  try {
    const res = await fetch('/api/ai/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    clearInterval(stepTimer);

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    lastResult = data;
    isGenerating = false;

    if (resultArea) resultArea.innerHTML = renderResult(data);

    setTimeout(() => {
      document.getElementById('btn-receti-new')?.addEventListener('click', () => {
        if (resultArea) resultArea.innerHTML = '';
        document.getElementById('receti-prompt')?.focus();
      });
    }, 100);

    showToast(`¡"${data.receta.nombre}" creada! 🍳`, 'success');
  } catch (err) {
    clearInterval(stepTimer);
    isGenerating = false;
    if (resultArea) resultArea.innerHTML = '';
    showToast(`Error: ${err.message}`, 'error');
  }
}

export async function renderReceti() {
  const status = await checkAIStatus();

  const bannerHtml = !status.available
    ? `<div class="receti-warning card mb-lg" style="border-color:#E8734A; background: rgba(232,115,74,0.08);">
        <div class="card-body">
          <div class="flex items-center gap-sm mb-sm">
            <span style="font-size:1.4rem;">⚠️</span>
            <div class="heading-sm">API Key no configurada</div>
          </div>
          <p class="text-sm text-secondary">Para usar Receti IA necesitás agregar tu clave de Google Gemini al archivo <code style="background:var(--bg-elevated);padding:2px 6px;border-radius:4px;">.env</code>:</p>
          <code class="receti-code">GEMINI_API_KEY=tu_key_aqui</code>
          <p class="text-xs text-muted mt-sm">Obtené tu key gratis en <strong>aistudio.google.com</strong></p>
        </div>
      </div>`
    : '';

  setTimeout(() => {
    // Example chips
    document.querySelectorAll('.receti-example').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = document.getElementById('receti-prompt');
        if (input) {
          input.value = chip.dataset.prompt;
          input.focus();
        }
      });
    });

    // Generate button
    document.getElementById('btn-receti-generate')?.addEventListener('click', () => {
      const prompt = document.getElementById('receti-prompt')?.value;
      generate(prompt);
    });

    // Enter key
    document.getElementById('receti-prompt')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const prompt = document.getElementById('receti-prompt')?.value;
        generate(prompt);
      }
    });
  }, 100);

  return `
    <!-- Hero -->
    <div class="receti-hero">
      <div class="receti-avatar-hero">
        ${renderRecitiAvatar(72)}
        <div class="receti-pulse"></div>
      </div>
      <div>
        <h1 class="heading-lg">Hola, soy <span style="color:var(--primary);">Receti</span> 🤖</h1>
        <p class="text-sm text-secondary">Tu chef robot con inteligencia artificial.<br>Pedime cualquier receta y la preparo para vos.</p>
      </div>
    </div>

    ${bannerHtml}

    <!-- Input -->
    <div class="card mb-md">
      <div class="card-body">
        <label class="form-label mb-sm" style="display:block;">¿Qué querés cocinar hoy?</label>
        <textarea
          class="form-input mb-sm"
          id="receti-prompt"
          rows="3"
          placeholder="Ej: Haceme una receta de paella valenciana para 6 personas, que sea tradicional..."
          ${!status.available ? 'disabled' : ''}
        ></textarea>
        <button class="btn btn-primary w-full" id="btn-receti-generate" ${!status.available ? 'disabled' : ''}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Generar receta con IA
        </button>
      </div>
    </div>

    <!-- Example prompts -->
    <div class="mb-lg">
      <p class="text-xs text-muted mb-sm" style="text-transform:uppercase; letter-spacing:.05em;">Ideas para empezar</p>
      <div class="chip-group">
        ${PROMPT_EXAMPLES.map((p) =>
          `<button class="chip receti-example" data-prompt="${p.substring(3)}">${p}</button>`
        ).join('')}
      </div>
    </div>

    <!-- Result area -->
    <div id="receti-result-area"></div>

    <!-- Info footer -->
    <div class="receti-footer">
      <p class="text-xs text-muted text-center">
        🤖 Las recetas generadas por Receti son públicas y aparecen en la comunidad.<br>
        Powered by <strong>Gemini 2.0 Flash</strong> · Google AI
      </p>
    </div>
  `;
}
