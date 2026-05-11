<?php
/**
 * RecetarioApp — Chat Server
 * API de Usuarios disponibles para chat
 *
 * GET /api/users?exclude_id=X&search=query → lista usuarios disponibles
 *
 * NOTA: Este endpoint recibe la lista de usuarios desde Node.js
 * vía POST /api/users/sync para mantener una copia local actualizada.
 *
 * GET  /api/users          → lista usuarios del chat cache
 * POST /api/users/sync     → Node.js sincroniza usuarios de RecetarioApp
 */

require_once __DIR__ . '/../api/auth.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();
$userId = requireAuth();

$path  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts = array_values(array_filter(explode('/', $path)));
$sub   = $parts[2] ?? null; // 'sync' si es /api/users/sync

// ─── POST /api/users/sync ─────────────────────────────────────────────
// Node.js envía la lista de usuarios de RecetarioApp para cachear en PHP
if ($method === 'POST' && $sub === 'sync') {
    $body  = getRequestBody();
    $users = $body['users'] ?? [];

    if (!is_array($users)) jsonResponse(['error' => 'users debe ser un array'], 400);

    $stmt = $db->prepare("
        INSERT INTO chat_users_cache (user_id, username, avatar_file_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            username       = VALUES(username),
            avatar_file_id = VALUES(avatar_file_id),
            updated_at     = NOW()
    ");

    $synced = 0;
    foreach ($users as $u) {
        $uid = (int)($u['id'] ?? 0);
        if ($uid <= 0) continue;
        $stmt->execute([
            $uid,
            $u['username'] ?? '',
            $u['avatar_file_id'] ?? null,
        ]);
        $synced++;
    }

    jsonResponse(['success' => true, 'synced' => $synced]);
}

// ─── GET /api/users ───────────────────────────────────────────────────
if ($method === 'GET') {
    $excludeId = (int)($_GET['exclude_id'] ?? $userId);
    $search    = '%' . trim($_GET['search'] ?? '') . '%';

    $stmt = $db->prepare("
        SELECT user_id AS id, username, avatar_file_id
        FROM chat_users_cache
        WHERE user_id != ?
          AND username LIKE ?
        ORDER BY username ASC
        LIMIT 50
    ");
    $stmt->execute([$excludeId, $search]);
    $users = $stmt->fetchAll();
    jsonResponse(['success' => true, 'users' => $users]);
}

jsonResponse(['error' => 'Method not allowed'], 405);
