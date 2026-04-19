/* ═══════════════════════════════════════════════════════════════════
   Receti AI View — Generate recipes with Gemini via the Receti bot
   The backend only calls Gemini and returns JSON.
   This view saves the recipe to the DB using the user's own session.
   ═══════════════════════════════════════════════════════════════════ */

import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';
import { isLoggedIn, getToken, getUser } from '../lib/auth.js';
import { select, insert, esc } from '../lib/api.js';

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
        <div class="receti-step" id="step-3">💾 Guardando en tu cuenta...</div>
      </div>
    </div>`;
}

function renderResult(result) {
  const { receta, ingredientes, recetaId } = result;
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
        <div class="flex gap-sm mb-sm flex-wrap">
          <div class="tag tag-accent">🤖 Generado con IA</div>
          <div class="tag">🔒 Privada (solo vos)</div>
        </div>
        <h2 class="heading-md mb-sm">${receta.nombre}</h2>
        ${receta.descripcion ? `<p class="text-sm text-secondary mb-md">${receta.descripcion}</p>` : ''}

        <div class="recipe-meta mb-md">
          ${receta.tiempo_preparacion ? `<div class="recipe-meta-item">⏱️ ${receta.tiempo_preparacion} min</div>` : ''}
          ${receta.porciones ? `<div class="recipe-meta-item">👥 ${receta.porciones} porciones</div>` : ''}
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
        <button class="btn btn-accent flex-1" id="btn-receti-view" onclick="window.location.hash='/receta/${recetaId}'">
          Ver receta →
        </button>
      </div>
    </div>`;
}

async function saveRecipeToAccount(recipeData) {
  const user = getUser();
  if (!user) throw new Error('No hay sesión activa');

  // 1. Create/reuse ingredients (private, owned by user)
  const ingredienteIds = [];
  for (const ing of (recipeData.ingredientes || [])) {
    try {
      // Check if user already has this ingredient
      let existing = await select(
        `SELECT id FROM ingredientes WHERE nombre = ${esc(ing.nombre)} AND autor_id = ${user.id}`
      );
      let ingId;
      if (existing.length > 0) {
        ingId = existing[0].id;
      } else {
        const r = await insert('ingredientes', {
          nombre: ing.nombre,
          categoria: ing.categoria || 'otros',
          autor_id: user.id,
          privacidad: 'privado',
        });
        ingId = r?.insertId;
      }
      if (ingId) ingredienteIds.push({ id: ingId, nombre: ing.nombre, cantidad: ing.cantidad, unidad: ing.unidad });
    } catch (e) {
      console.warn('Ingredient save error:', e.message);
    }
  }

  // 2. Create recipe with generado_ia = true
  const recetaRes = await insert('recetas', {
    nombre: recipeData.nombre,
    descripcion: recipeData.descripcion || null,
    instrucciones: recipeData.instrucciones || null,
    tiempo_preparacion: recipeData.tiempo_preparacion || null,
    porciones: recipeData.porciones || null,
    autor_id: user.id,
    privacidad: 'privado',
    generado_ia: 1,
  });
  const recetaId = recetaRes?.insertId;
  if (!recetaId) throw new Error('No se pudo crear la receta');

  // 3. Link ingredients to recipe
  for (const ing of ingredienteIds) {
    try {
      await insert('receta_ingredientes', {
        receta_id: recetaId,
        ingrediente_id: ing.id,
        cantidad: ing.cantidad || null,
        unidad: ing.unidad || null,
      });
    } catch (e) { console.warn('Link error:', e.message); }
  }

  return { recetaId, ingredientes: ingredienteIds };
}

async function generate(prompt) {
  if (isGenerating) return;
  if (!isLoggedIn()) {
    showToast('Iniciá sesión para generar recetas con IA 🔐', 'error');
    return navigate('/login');
  }
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
    // 1. Ask backend for AI-generated recipe data (backend only calls Gemini)
    const token = getToken();
    const res = await fetch('/api/ai/generate-recipe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    clearInterval(stepTimer);

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Error desconocido');

    const recipeData = data.recipeData;

    // 2. Save recipe to DB using the user's own session (frontend handles DB writes)
    const { recetaId, ingredientes } = await saveRecipeToAccount(recipeData);

    lastResult = { receta: recipeData, ingredientes, recetaId };
    isGenerating = false;

    if (resultArea) resultArea.innerHTML = renderResult(lastResult);

    setTimeout(() => {
      document.getElementById('btn-receti-new')?.addEventListener('click', () => {
        if (resultArea) resultArea.innerHTML = '';
        document.getElementById('receti-prompt')?.focus();
      });
    }, 100);

    showToast(`¡"${recipeData.nombre}" guardada en tu cuenta! 🍳`, 'success');
  } catch (err) {
    clearInterval(stepTimer);
    isGenerating = false;
    if (resultArea) resultArea.innerHTML = '';
    showToast(`Error: ${err.message}`, 'error');
  }
}

export async function renderReceti() {
  // Gate: user must be logged in to use the AI
  if (!isLoggedIn()) {
    return `
      <div class="receti-hero">
        <div class="receti-avatar-hero">
          ${renderRecitiAvatar(72)}
          <div class="receti-pulse"></div>
        </div>
        <div>
          <h1 class="heading-lg">Hola, soy <span style="color:var(--primary);">Receti</span> 🤖</h1>
          <p class="text-sm text-secondary">Tu chef robot con inteligencia artificial.</p>
        </div>
      </div>
      <div class="card" style="border-color:var(--primary); background: rgba(var(--primary-rgb, 232,115,74), 0.08);">
        <div class="card-body text-center">
          <div style="font-size:2rem; margin-bottom:var(--space-sm);">🔐</div>
          <h2 class="heading-md mb-sm">Iniciá sesión para usar Receti</h2>
          <p class="text-sm text-secondary mb-md">Las recetas generadas por IA se guardan en tu cuenta de forma privada.</p>
          <button class="btn btn-primary w-full" onclick="window.location.hash='/login'">
            Ingresar a mi cuenta
          </button>
          <button class="btn btn-ghost w-full mt-sm" onclick="window.location.hash='/register'">
            Crear cuenta gratis
          </button>
        </div>
      </div>`;
  }

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
        🔒 Las recetas se guardan de forma <strong>privada</strong> en tu cuenta.<br>
        Podés publicarlas en la comunidad desde el detalle de la receta.<br>
        Powered by <strong>Gemini 2.0 Flash</strong> · Google AI
      </p>
    </div>
  `;
}
