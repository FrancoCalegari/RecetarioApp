/* ═══════════════════════════════════════════════════════════════════
   IndexedDB Wrapper — Offline data persistence + user-linked cache
   ═══════════════════════════════════════════════════════════════════ */

const DB_NAME = 'recetarioDB';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // User-specific recipe cache: keyed by userId
      if (!db.objectStoreNames.contains('recetas_cache')) {
        const store = db.createObjectStore('recetas_cache', { keyPath: '_cacheKey' });
        store.createIndex('userId', 'userId', { unique: false });
      }

      // User-specific ingredient cache
      if (!db.objectStoreNames.contains('ingredientes_cache')) {
        const store = db.createObjectStore('ingredientes_cache', { keyPath: '_cacheKey' });
        store.createIndex('userId', 'userId', { unique: false });
      }

      // Offline queue — pending creates/edits to sync
      if (!db.objectStoreNames.contains('offline_queue')) {
        const store = db.createObjectStore('offline_queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      // App settings/meta
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────────
async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Recipe Cache (user-linked) ───────────────────────────────────────
export async function getCachedRecetas(userId = 'public') {
  try {
    const item = await idbGet('recetas_cache', `recetas_${userId}`);
    return item?.data || null;
  } catch { return null; }
}

export async function setCachedRecetas(data, userId = 'public') {
  try {
    await idbPut('recetas_cache', {
      _cacheKey: `recetas_${userId}`,
      userId,
      data,
      cachedAt: Date.now(),
    });
  } catch (e) { console.warn('IDB cache error:', e); }
}

// ─── Ingredient Cache (user-linked) ──────────────────────────────────
export async function getCachedIngredientes(userId = 'public') {
  try {
    const item = await idbGet('ingredientes_cache', `ingredientes_${userId}`);
    return item?.data || null;
  } catch { return null; }
}

export async function setCachedIngredientes(data, userId = 'public') {
  try {
    await idbPut('ingredientes_cache', {
      _cacheKey: `ingredientes_${userId}`,
      userId,
      data,
      cachedAt: Date.now(),
    });
  } catch (e) { console.warn('IDB cache error:', e); }
}

// ─── Offline Queue ────────────────────────────────────────────────────
export async function enqueueOffline(type, data, meta = {}) {
  try {
    await idbPut('offline_queue', {
      type,            // 'create_receta' | 'create_ingrediente'
      data,            // payload to send
      meta,            // extra info (userId, etc.)
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0,
    });
  } catch (e) { console.warn('Enqueue error:', e); }
}

export async function getOfflineQueue() {
  try {
    const all = await idbGetAll('offline_queue');
    return all.filter((item) => item.status === 'pending');
  } catch { return []; }
}

export async function getAllQueueItems() {
  try {
    return await idbGetAll('offline_queue');
  } catch { return []; }
}

export async function updateQueueItem(id, updates) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_queue', 'readwrite');
      const store = tx.objectStore('offline_queue');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          const updated = { ...item, ...updates };
          store.put(updated);
          resolve(updated);
        } else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.warn('Update queue error:', e); }
}

export async function removeQueueItem(id) {
  try {
    await idbDelete('offline_queue', id);
  } catch (e) { console.warn('Remove queue error:', e); }
}

export async function clearCompletedQueue() {
  try {
    const all = await idbGetAll('offline_queue');
    const done = all.filter((i) => i.status === 'synced' || i.status === 'failed_permanent');
    for (const item of done) await idbDelete('offline_queue', item.id);
  } catch (e) { console.warn('Clear queue error:', e); }
}

// ─── Settings ─────────────────────────────────────────────────────────
export async function getSetting(key) {
  try {
    const item = await idbGet('settings', key);
    return item?.value;
  } catch { return null; }
}

export async function setSetting(key, value) {
  try {
    await idbPut('settings', { key, value });
  } catch (e) { console.warn('Setting error:', e); }
}

// ─── Init ─────────────────────────────────────────────────────────────
export async function initIDB() {
  try {
    await openDB();
    console.log('✅ IndexedDB ready');
    return true;
  } catch (e) {
    console.warn('IDB init error:', e);
    return false;
  }
}
