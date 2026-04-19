/* ═══════════════════════════════════════════════════════════════════
   Recipe Form View — Create / Edit a recipe
   ═══════════════════════════════════════════════════════════════════ */

import { select, insert, update, esc, uploadFile, getFileUrl } from '../lib/api.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../lib/router.js';
import { isLoggedIn, getUser } from '../lib/auth.js';

const PRIVACIDAD_OPTS = [
  { value: 'privado',    label: '🔒 Privado',    desc: 'Solo vos podés verla' },
  { value: 'no_listado', label: '🔗 No listado',  desc: 'Visible con el link' },
  { value: 'publico',    label: '🌍 Público',     desc: 'Visible en la comunidad' },
];

let selectedIngredients = []; // { ingrediente_id, nombre, cantidad, unidad }
let allIngredientes = [];
let imageFile = null;
let editingReceta = null;

const CATEGORIAS_INGREDIENTE = [
  'Carnes', 'Verduras', 'Frutas', 'Lácteos', 'Cereales',
  'Legumbres', 'Condimentos', 'Aceites', 'Bebidas', 'Otros',
];

async function loadIngredientes() {
  try {
    allIngredientes = await select('SELECT * FROM ingredientes ORDER BY nombre') || [];
  } catch { allIngredientes = []; }
}

async function loadReceta(id) {
  if (!id || id === 'nueva') return null;
  try {
    const [receta] = await select(`SELECT * FROM recetas WHERE id = ${id}`);
    if (!receta) return null;

    const ings = await select(
      `SELECT ri.*, i.nombre FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id WHERE ri.receta_id = ${id}`
    );
    selectedIngredients = (ings || []).map((i) => ({
      ingrediente_id: i.ingrediente_id,
      nombre: i.nombre,
      cantidad: i.cantidad || '',
      unidad: i.unidad || '',
    }));

    return receta;
  } catch { return null; }
}

function renderIngredientSelector() {
  const available = allIngredientes.filter(
    (i) => !selectedIngredients.some((s) => s.ingrediente_id === i.id)
  );

  const selectedHtml = selectedIngredients.map((si, idx) => `
    <div class="ingredient-item" style="cursor:default;">
      <span class="ingredient-item-dot"></span>
      <span style="flex:1">${si.nombre}</span>
      <input type="text" class="form-input" placeholder="Cant." value="${si.cantidad}" 
             style="width:70px; padding:6px 8px; font-size:0.82rem;" 
             data-ing-idx="${idx}" data-field="cantidad" />
      <input type="text" class="form-input" placeholder="Unid." value="${si.unidad}" 
             style="width:70px; padding:6px 8px; font-size:0.82rem;" 
             data-ing-idx="${idx}" data-field="unidad" />
      <button class="btn btn-ghost btn-sm" data-remove-ing="${idx}" title="Quitar">✕</button>
    </div>
  `).join('');

  return `
    <div class="form-group">
      <label class="form-label">Ingredientes</label>
      <div id="selected-ingredients" class="flex flex-col gap-sm mb-sm">
        ${selectedHtml || '<p class="text-sm text-muted">Sin ingredientes seleccionados</p>'}
      </div>
      
      <div class="flex gap-sm">
        <select class="form-input" id="ingredient-select" style="flex:1">
          <option value="">Agregar ingrediente...</option>
          ${available.map((i) => `<option value="${i.id}">${i.nombre}</option>`).join('')}
        </select>
        <button class="btn btn-accent btn-sm" type="button" id="btn-add-ingredient">+</button>
      </div>

      <!-- Create new ingredient inline -->
      <details class="mt-sm" id="new-ingredient-section">
        <summary class="text-sm text-secondary" style="cursor:pointer; user-select:none;">
          ¿No encontrás el ingrediente? Creá uno nuevo
        </summary>
        <div class="flex flex-col gap-sm mt-sm" style="padding: var(--space-sm); background: var(--bg-elevated); border-radius: var(--radius-md);">
          <input type="text" class="form-input" id="new-ing-nombre" placeholder="Nombre del ingrediente" />
          <select class="form-input" id="new-ing-categoria">
            <option value="">Categoría (opcional)</option>
            ${CATEGORIAS_INGREDIENTE.map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <button class="btn btn-accent btn-sm" type="button" id="btn-create-ingredient">Crear y agregar</button>
        </div>
      </details>
    </div>
  `;
}

function refreshIngredientUI() {
  const container = document.getElementById('ingredient-section');
  if (container) {
    container.innerHTML = renderIngredientSelector();
    bindIngredientEvents();
  }
}

function bindIngredientEvents() {
  // Add existing ingredient
  document.getElementById('btn-add-ingredient')?.addEventListener('click', () => {
    const sel = document.getElementById('ingredient-select');
    const id = parseInt(sel.value);
    if (!id) return;
    const ing = allIngredientes.find((i) => i.id === id);
    if (ing) {
      selectedIngredients.push({
        ingrediente_id: ing.id,
        nombre: ing.nombre,
        cantidad: '',
        unidad: '',
      });
      refreshIngredientUI();
    }
  });

  // Create new ingredient
  document.getElementById('btn-create-ingredient')?.addEventListener('click', async () => {
    const nombre = document.getElementById('new-ing-nombre')?.value?.trim();
    if (!nombre) return showToast('Ingresá un nombre', 'error');
    const categoria = document.getElementById('new-ing-categoria')?.value || null;
    try {
      await insert('ingredientes', { nombre, categoria });
      await loadIngredientes();
      const newIng = allIngredientes.find((i) => i.nombre === nombre);
      if (newIng) {
        selectedIngredients.push({
          ingrediente_id: newIng.id,
          nombre: newIng.nombre,
          cantidad: '',
          unidad: '',
        });
      }
      showToast('Ingrediente creado ✓', 'success');
      refreshIngredientUI();
    } catch (e) {
      showToast('Error al crear ingrediente', 'error');
    }
  });

  // Remove ingredient
  document.querySelectorAll('[data-remove-ing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.removeIng);
      selectedIngredients.splice(idx, 1);
      refreshIngredientUI();
    });
  });

  // Update cantidad/unidad
  document.querySelectorAll('[data-ing-idx]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.ingIdx);
      const field = e.target.dataset.field;
      if (selectedIngredients[idx]) {
        selectedIngredients[idx][field] = e.target.value;
      }
    });
  });
}

function bindFormEvents() {
  // Image preview
  const fileInput = document.getElementById('recipe-image');
  fileInput?.addEventListener('change', (e) => {
    imageFile = e.target.files[0];
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('image-preview');
        if (preview) {
          preview.innerHTML = `<img src="${ev.target.result}" style="width:100%; aspect-ratio:16/10; object-fit:cover; border-radius: var(--radius-md);" />`;
        }
      };
      reader.readAsDataURL(imageFile);
    }
  });

  // Submit
  document.getElementById('recipe-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('recipe-nombre')?.value?.trim();
    if (!nombre) return showToast('El nombre es obligatorio', 'error');

    const submitBtn = document.getElementById('btn-submit-recipe');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      let imagenFileId = editingReceta?.imagen_file_id || null;

      // Upload image if new one selected
      if (imageFile) {
        const uploadRes = await uploadFile(imageFile);
        if (uploadRes?.files?.[0]?.id) {
          imagenFileId = uploadRes.files[0].id;
        } else if (uploadRes?.id) {
          imagenFileId = uploadRes.id;
        }
      }

      const user = getUser();
      const recetaData = {
        nombre,
        descripcion: document.getElementById('recipe-descripcion')?.value || null,
        instrucciones: document.getElementById('recipe-instrucciones')?.value || null,
        tiempo_preparacion: parseInt(document.getElementById('recipe-tiempo')?.value) || null,
        porciones: parseInt(document.getElementById('recipe-porciones')?.value) || null,
        imagen_file_id: imagenFileId,
        privacidad: document.getElementById('recipe-privacidad')?.value || 'privado',
        autor_id: user ? user.id : (editingReceta?.autor_id || null),
        // If editing an AI-generated recipe, clear the flag
        ...(editingReceta?.generado_ia ? { generado_ia: 0 } : {}),
      };

      let recetaId;
      if (editingReceta) {
        await update('recetas', editingReceta.id, recetaData);
        recetaId = editingReceta.id;
        // Clean old ingredients
        await select(`DELETE FROM receta_ingredientes WHERE receta_id = ${recetaId}`);
      } else {
        const res = await insert('recetas', recetaData);
        recetaId = res?.insertId;
      }

      // Insert ingredients
      for (const si of selectedIngredients) {
        await insert('receta_ingredientes', {
          receta_id: recetaId,
          ingrediente_id: si.ingrediente_id,
          cantidad: si.cantidad || null,
          unidad: si.unidad || null,
        });
      }

      showToast(editingReceta ? 'Receta actualizada ✓' : 'Receta creada ✓', 'success');
      navigate(recetaId ? `/receta/${recetaId}` : '/recetas');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Error al guardar: ' + err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingReceta ? 'Guardar cambios' : 'Crear receta';
      }
    }
  });

  bindIngredientEvents();
}

export async function renderRecetaForm({ id }) {
  selectedIngredients = [];
  imageFile = null;
  editingReceta = null;

  await loadIngredientes();

  const isEdit = id && id !== 'nueva';
  if (isEdit) {
    editingReceta = await loadReceta(id);
    if (!editingReceta) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">Receta no encontrada</div>
          <button class="btn btn-primary mt-md" onclick="window.location.hash='/recetas'">Volver</button>
        </div>
      `;
    }
  }

  const r = editingReceta || {};
  const imagePreview = r.imagen_file_id
    ? `<img src="${getFileUrl(r.imagen_file_id)}" style="width:100%; aspect-ratio:16/10; object-fit:cover; border-radius: var(--radius-md);" />`
    : `<div style="width:100%; aspect-ratio:16/10; background: var(--bg-elevated); border-radius: var(--radius-md); display:flex; align-items:center; justify-content:center; color: var(--text-muted);">📸 Sin imagen</div>`;

  setTimeout(() => bindFormEvents(), 100);

  return `
    <div class="section-header">
      <button class="btn btn-ghost btn-sm" onclick="window.history.back()">← Volver</button>
      <h1 class="heading-lg">${isEdit ? 'Editar' : 'Nueva'} Receta</h1>
    </div>

    ${isEdit && r.generado_ia ? `
      <div class="card mb-md" style="border-color: var(--primary); background: rgba(232,115,74,0.08);">
        <div class="card-body flex items-center gap-sm">
          <span style="font-size:1.5rem;">🤖</span>
          <div>
            <div class="text-sm" style="font-weight:600;">Receta generada con IA</div>
            <div class="text-xs text-muted">Al guardar cambios, la etiqueta “Generado con IA” se desactivará automáticamente.</div>
          </div>
        </div>
      </div>
    ` : ''}

    <form id="recipe-form" class="flex flex-col gap-lg">
      <!-- Image -->
      <div class="form-group">
        <label class="form-label">Imagen</label>
        <div id="image-preview" class="mb-sm">${imagePreview}</div>
        <input type="file" accept="image/*" id="recipe-image" class="form-input" style="padding:10px;" />
      </div>

      <!-- Name -->
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input type="text" class="form-input" id="recipe-nombre" placeholder="Ej: Milanesas con puré" value="${r.nombre || ''}" required />
      </div>

      <!-- Description -->
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-input" id="recipe-descripcion" placeholder="Una breve descripción de la receta..." rows="2">${r.descripcion || ''}</textarea>
      </div>

      <!-- Time & Portions -->
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Tiempo (min)</label>
          <input type="number" class="form-input" id="recipe-tiempo" placeholder="30" min="1" value="${r.tiempo_preparacion || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Porciones</label>
          <input type="number" class="form-input" id="recipe-porciones" placeholder="4" min="1" value="${r.porciones || ''}" />
        </div>
      </div>

      <!-- Privacy -->
      <div class="form-group">
        <label class="form-label">Privacidad</label>
        <select class="form-input" id="recipe-privacidad">
          ${PRIVACIDAD_OPTS.map((p) =>
            `<option value="${p.value}" ${(r.privacidad || 'privado') === p.value ? 'selected' : ''}>${p.label} — ${p.desc}</option>`
          ).join('')}
        </select>
      </div>

      <!-- Ingredients -->
      <div id="ingredient-section">
        ${renderIngredientSelector()}
      </div>

      <!-- Instructions -->
      <div class="form-group">
        <label class="form-label">Instrucciones</label>
        <textarea class="form-input" id="recipe-instrucciones" placeholder="Escribí cada paso en una línea nueva..." rows="6">${r.instrucciones || ''}</textarea>
        <span class="text-xs text-muted">Cada línea será un paso de la preparación</span>
      </div>

      <!-- Submit -->
      <button type="submit" class="btn btn-primary w-full" id="btn-submit-recipe">
        ${isEdit ? 'Guardar cambios' : 'Crear receta'}
      </button>
    </form>
  `;
}
