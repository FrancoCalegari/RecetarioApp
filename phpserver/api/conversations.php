<?php
/**
 * RecetarioApp — Chat Server
 * API de Conversaciones
 *
 * GET  /api/conversations         → lista conversaciones del usuario actual
 * POST /api/conversations         → crea o retorna conversación con otro usuario
 * GET  /api/conversations/{id}    → detalle de una conversación
 */

require_once __DIR__ . '/../api/auth.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();
$userId = requireAuth();

// Extraer segmento de ruta: /api/conversations/{id}
$path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts  = array_values(array_filter(explode('/', $path)));
// $parts[0]=api, $parts[1]=conversations, $parts[2]=?id
$convId = isset($parts[2]) ? (int)$parts[2] : null;

// ─── GET /api/conversations ────────────────────────────────────────────
if ($method === 'GET' && $convId === null) {
    $stmt = $db->prepare("
        SELECT
            c.id,
            c.user1_id,
            c.user2_id,
            c.created_at,
            -- Último mensaje
            m.content      AS last_message,
            m.created_at   AS last_message_at,
            m.sender_id    AS last_sender_id,
            -- No leídos para el usuario actual
            (SELECT COUNT(*) FROM chat_messages
             WHERE conversation_id = c.id
               AND sender_id != :uid_unread
               AND read_at IS NULL) AS unread_count,
            -- El interlocutor (el otro usuario)
            IF(c.user1_id = :uid_other, c.user2_id, c.user1_id) AS other_user_id
        FROM chat_conversations c
        LEFT JOIN chat_messages m ON m.id = (
            SELECT id FROM chat_messages
            WHERE conversation_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
        )
        WHERE c.user1_id = :uid1 OR c.user2_id = :uid2
        ORDER BY COALESCE(m.created_at, c.created_at) DESC
    ");
    $stmt->execute([
        ':uid1'       => $userId,
        ':uid2'       => $userId,
        ':uid_unread' => $userId,
        ':uid_other'  => $userId,
    ]);
    $convs = $stmt->fetchAll();
    jsonResponse(['success' => true, 'conversations' => $convs]);
}

// ─── POST /api/conversations ──────────────────────────────────────────
if ($method === 'POST' && $convId === null) {
    $body      = getRequestBody();
    $otherUser = (int)($body['other_user_id'] ?? 0);

    if ($otherUser <= 0 || $otherUser === $userId) {
        jsonResponse(['error' => 'ID de usuario inválido'], 400);
    }

    // Normalizar orden (siempre user1 < user2)
    $u1 = min($userId, $otherUser);
    $u2 = max($userId, $otherUser);

    // Buscar si ya existe
    $stmt = $db->prepare(
        'SELECT id FROM chat_conversations WHERE user1_id = ? AND user2_id = ?'
    );
    $stmt->execute([$u1, $u2]);
    $existing = $stmt->fetch();

    if ($existing) {
        jsonResponse(['success' => true, 'conversation_id' => (int)$existing['id'], 'created' => false]);
    }

    // Crear nueva
    $stmt = $db->prepare(
        'INSERT INTO chat_conversations (user1_id, user2_id) VALUES (?, ?)'
    );
    $stmt->execute([$u1, $u2]);
    $newId = (int)$db->lastInsertId();
    jsonResponse(['success' => true, 'conversation_id' => $newId, 'created' => true], 201);
}

// ─── GET /api/conversations/{id} ─────────────────────────────────────
if ($method === 'GET' && $convId !== null) {
    $stmt = $db->prepare(
        'SELECT * FROM chat_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    );
    $stmt->execute([$convId, $userId, $userId]);
    $conv = $stmt->fetch();
    if (!$conv) jsonResponse(['error' => 'Conversación no encontrada'], 404);
    jsonResponse(['success' => true, 'conversation' => $conv]);
}

jsonResponse(['error' => 'Method not allowed'], 405);
