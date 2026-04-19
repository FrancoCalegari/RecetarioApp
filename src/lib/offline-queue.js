/* ═══════════════════════════════════════════════════════════════════
   Offline Queue Manager — Sync pending data when connection returns
   ═══════════════════════════════════════════════════════════════════ */

import {
  getOfflineQueue,
  updateQueueItem,
  removeQueueItem,
  clearCompletedQueue,
  enqueueOffline,
} from './idb.js';
import { getUser } from './auth.js';

const MAX_ATTEMPTS = 3;
let _isSyncing = false;
let _onSyncCallbacks = [];

// ─── Register sync callback (UI listeners) ───────────────────────────
export function onSyncComplete(fn) {
  _onSyncCallbacks.push(fn);
}

function notifySyncComplete(results) {
  _onSyncCallbacks.forEach((fn) => fn(results));
}

// ─── Check if online ──────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine !== false;
}

// ─── Process the offline queue ────────────────────────────────────────
export async function processQueue() {
  if (_isSyncing || !isOnline()) return { synced: 0, failed: 0 };
  _isSyncing = true;

  const queue = await getOfflineQueue();
  if (queue.length === 0) { _isSyncing = false; return { synced: 0, failed: 0 }; }

  console.log(`🔄 Processing offline queue: ${queue.length} items`);

  let synced = 0, failed = 0;

  for (const item of queue) {
    try {
      const result = await syncItem(item);
      if (result.ok) {
        await updateQueueItem(item.id, { status: 'synced', syncedAt: Date.now() });
        synced++;
      } else {
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await updateQueueItem(item.id, { status: 'failed_permanent', attempts, lastError: result.error });
          failed++;
        } else {
          await updateQueueItem(item.id, { attempts, lastError: result.error });
        }
      }
    } catch (e) {
      failed++;
      await updateQueueItem(item.id, { status: 'failed_permanent', lastError: e.message });
    }
  }

  await clearCompletedQueue();
  _isSyncing = false;

  const results = { synced, failed, total: queue.length };
  notifySyncComplete(results);

  if (synced > 0) {
    console.log(`✅ Queue sync: ${synced} subidos, ${failed} fallidos`);
  }

  return results;
}

async function syncItem(item) {
  switch (item.type) {
    case 'create_receta': {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.data.sql }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const d = await res.json();
      if (!d.success) return { ok: false, error: d.error || 'Error SQL' };

      // Link ingredients
      if (item.data.ingredientes && d.result?.insertId) {
        const recetaId = d.result.insertId;
        for (const ing of item.data.ingredientes) {
          await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, unidad) VALUES (${recetaId}, ${ing.ingrediente_id}, ${ing.cantidad ? `'${ing.cantidad}'` : 'NULL'}, ${ing.unidad ? `'${ing.unidad}'` : 'NULL'})`,
            }),
          });
        }
      }
      return { ok: true };
    }

    case 'create_ingrediente': {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.data.sql }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const d = await res.json();
      return d.success ? { ok: true } : { ok: false, error: d.error };
    }

    default:
      return { ok: false, error: `Unknown type: ${item.type}` };
  }
}

// ─── Public enqueue API ───────────────────────────────────────────────
export async function queueCreateReceta(sql, ingredientes = []) {
  const user = getUser();
  await enqueueOffline('create_receta', { sql, ingredientes }, { userId: user?.id });
  updateQueueBadge();
}

export async function queueCreateIngrediente(sql) {
  const user = getUser();
  await enqueueOffline('create_ingrediente', { sql }, { userId: user?.id });
  updateQueueBadge();
}

// ─── Queue badge on navbar ────────────────────────────────────────────
export function updateQueueBadge() {
  getOfflineQueue().then((queue) => {
    const badge = document.getElementById('offline-queue-badge');
    if (badge) {
      if (queue.length > 0) {
        badge.textContent = queue.length;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    // Update status bar
    const statusBar = document.getElementById('offline-status-bar');
    if (statusBar) {
      if (!isOnline()) {
        statusBar.innerHTML = `<span>📴 Sin conexión · ${queue.length} pendiente${queue.length !== 1 ? 's' : ''}</span>`;
        statusBar.style.display = '';
      } else if (queue.length > 0) {
        statusBar.innerHTML = `<span>🔄 Sincronizando ${queue.length} item${queue.length !== 1 ? 's' : ''}...</span>`;
        statusBar.style.display = '';
      } else {
        statusBar.style.display = 'none';
      }
    }
  });
}

// ─── Network event listeners ──────────────────────────────────────────
export function initOfflineSync() {
  // On reconnect: process queue + fetch fresh data
  window.addEventListener('online', async () => {
    console.log('🌐 Online! Processing queue...');
    updateQueueBadge();

    // Wait a moment for connection to stabilize
    setTimeout(async () => {
      const results = await processQueue();
      if (results.synced > 0) {
        const event = new CustomEvent('offline-synced', { detail: results });
        window.dispatchEvent(event);
      }
    }, 1000);
  });

  window.addEventListener('offline', () => {
    console.log('📴 Offline');
    updateQueueBadge();
  });

  // Check queue on init if online
  if (isOnline()) {
    setTimeout(() => processQueue(), 3000);
  }

  updateQueueBadge();
}
