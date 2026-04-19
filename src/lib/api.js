/* ═══════════════════════════════════════════════════════════════════
   API Client — Communicates with Express proxy to SpiderAPI
   ═══════════════════════════════════════════════════════════════════ */

import { getToken, authFetch } from './auth.js';

// ─── SQL Proxy ───────────────────────────────────────────────────────
export async function query(sql) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function select(sql) {
  const resp = await query(sql);
  const data = resp?.result ?? resp?.data ?? resp?.rows ?? resp;
  return Array.isArray(data) ? data : [];
}

export async function insert(table, data) {
  const keys = Object.keys(data);
  const vals = keys.map((k) => esc(data[k]));
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${vals.join(', ')})`;
  const resp = await query(sql);
  return resp?.result || resp;
}

export async function update(table, id, data) {
  const sets = Object.entries(data).map(([k, v]) => `${k} = ${esc(v)}`).join(', ');
  return query(`UPDATE ${table} SET ${sets} WHERE id = ${id}`);
}

export async function remove(table, id) {
  if (!id) return null;
  return query(`DELETE FROM ${table} WHERE id = ${id}`);
}

export function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── File Storage ────────────────────────────────────────────────────
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/storage/upload', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  return res.json();
}

export function getFileUrl(fileId) {
  if (!fileId) return null;
  return `/api/storage/files/${fileId}`;
}

export async function deleteFile(fileId) {
  const res = await fetch(`/api/storage/files/${fileId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
  return res.json();
}

// ─── DB Init / Migrate ───────────────────────────────────────────────
export async function initDB() {
  const res = await fetch('/api/db/init', { method: 'POST' });
  if (!res.ok) throw new Error(`DB init failed: ${res.statusText}`);
  return res.json();
}

export async function migrateDB() {
  const res = await fetch('/api/db/migrate', { method: 'POST' });
  if (!res.ok) throw new Error(`DB migrate failed: ${res.statusText}`);
  return res.json();
}

// ─── Auth API ────────────────────────────────────────────────────────
export async function apiRegister({ username, email, password }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al registrar');
  return data;
}

export async function apiLogin({ username, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
  return data;
}

export async function apiMe() {
  const res = await authFetch('/api/auth/me');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error obteniendo perfil');
  return data;
}

export async function apiUpdateProfile({ bio }) {
  const res = await authFetch('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({ bio }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error actualizando perfil');
  return data;
}

export async function apiUpdateAvatar(avatarFileId) {
  const res = await authFetch('/api/auth/avatar', {
    method: 'PUT',
    body: JSON.stringify({ avatar_file_id: avatarFileId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error actualizando avatar');
  return data;
}

export async function apiGetUser(userId) {
  const res = await fetch(`/api/users/${userId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error obteniendo usuario');
  return data.user;
}

// ─── Ratings API ─────────────────────────────────────────────────────
export async function rateReceta(recetaId, puntaje) {
  const res = await authFetch(`/api/ratings/receta/${recetaId}`, {
    method: 'POST',
    body: JSON.stringify({ puntaje }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al calificar');
  return data;
}

export async function rateIngrediente(ingId, puntaje) {
  const res = await authFetch(`/api/ratings/ingrediente/${ingId}`, {
    method: 'POST',
    body: JSON.stringify({ puntaje }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al calificar');
  return data;
}
