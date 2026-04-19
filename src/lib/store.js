/* ═══════════════════════════════════════════════════════════════════
   Simple reactive store with pub/sub
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  recetas: [],
  ingredientes: [],
  planificacion: [],
  extras: [],
  loading: false,
};

const listeners = new Map();

/**
 * Get current state or a key from state
 */
export function getState(key) {
  if (key) return state[key];
  return { ...state };
}

/**
 * Update state and notify listeners
 */
export function setState(updates) {
  const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (state[key] !== value) {
      state[key] = value;
      changed.push(key);
    }
  }

  // Notify listeners for changed keys
  for (const key of changed) {
    const keyListeners = listeners.get(key) || [];
    keyListeners.forEach((fn) => fn(state[key], key));
  }
}

/**
 * Subscribe to state changes
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, []);
  listeners.get(key).push(fn);

  return () => {
    const arr = listeners.get(key);
    const idx = arr.indexOf(fn);
    if (idx > -1) arr.splice(idx, 1);
  };
}
