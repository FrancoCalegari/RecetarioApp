<?php
/**
 * RecetarioApp — Chat Server
 * API de Mensajes con soporte de Long-Polling
 *
 * GET  /api/messages?conversation_id=X[&since=timestamp]   → obtener mensajes
 * POST /api/messages                                         → enviar mensaje
 * PUT  /api/messages/read?conversation_id=X                 → marcar como leídos
 */

require_once __DIR__ . '/../api/auth.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();
$userId = requireAuth();

// ─── GET /api/messages ────────────────────────────────────────────────
if ($method === 'GET') {
    $convId = (int)($_GET['conversation_id'] ?? 0);
    if ($convId <= 0) jsonResponse(['error' => 'conversation_id requerido'], 400);

    // Verificar que el usuario pertenece a la conversación
    $stmt = $db->prepare(
        'SELECT id FROM chat_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    );
    $stmt->execute([$convId, $userId, $userId]);
    if (!$stmt->fetch()) jsonResponse(['error' => 'Conversación no encontrada'], 404);

    $since = $_GET['since'] ?? null; // Timestamp ISO 8601 o MySQL datetime
    $poll  = (bool)($_GET['poll'] ?? false); // Long-polling activado

    if ($poll && $since) {
        // ── Long-Polling: esperar hasta 20s por nuevos mensajes ──────
        $deadline = time() + 20;
        set_time_limit(25);

        while (time() < $deadline) {
            $msgs = fetchNewMessages($db, $convId, $since);
            if (!empty($msgs)) {
                markAsRead($db, $convId, $userId);
                jsonResponse(['success' => true, 'messages' => $msgs]);
            }
            sleep(1);
        }
        // Timeout — devolver vacío
        jsonResponse(['success' => true, 'messages' => []]);
    } else {
        // ── Carga normal o short-polling ──────────────────────────────
        if ($since) {
            $msgs = fetchNewMessages($db, $convId, $since);
        } else {
            $stmt = $db->prepare("
                SELECT id, conversation_id, sender_id, content, read_at, created_at
                FROM chat_messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                LIMIT 50
            ");
            $stmt->execute([$convId]);
            $msgs = $stmt->fetchAll();
        }
        markAsRead($db, $convId, $userId);
        jsonResponse(['success' => true, 'messages' => $msgs]);
    }
}

// ─── POST /api/messages ───────────────────────────────────────────────
if ($method === 'POST') {
    $body   = getRequestBody();
    $convId = (int)($body['conversation_id'] ?? 0);
    $content = trim($body['content'] ?? '');

    if ($convId <= 0)     jsonResponse(['error' => 'conversation_id requerido'], 400);
    if ($content === '')  jsonResponse(['error' => 'El mensaje no puede estar vacío'], 400);
    if (strlen($content) > 2000) jsonResponse(['error' => 'Mensaje demasiado largo (máx 2000 chars)'], 400);

    // Verificar que el usuario pertenece a la conversación
    $stmt = $db->prepare(
        'SELECT id FROM chat_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    );
    $stmt->execute([$convId, $userId, $userId]);
    if (!$stmt->fetch()) jsonResponse(['error' => 'Conversación no encontrada'], 404);

    $stmt = $db->prepare(
        'INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'
    );
    $stmt->execute([$convId, $userId, $content]);
    $msgId = (int)$db->lastInsertId();

    $stmt = $db->prepare('SELECT * FROM chat_messages WHERE id = ?');
    $stmt->execute([$msgId]);
    $msg = $stmt->fetch();

    jsonResponse(['success' => true, 'message' => $msg], 201);
}

// ─── PUT /api/messages/read ───────────────────────────────────────────
if ($method === 'PUT') {
    $convId = (int)($_GET['conversation_id'] ?? 0);
    if ($convId <= 0) jsonResponse(['error' => 'conversation_id requerido'], 400);
    markAsRead($db, $convId, $userId);
    jsonResponse(['success' => true]);
}

jsonResponse(['error' => 'Method not allowed'], 405);

// ─── Helpers ──────────────────────────────────────────────────────────
function fetchNewMessages(PDO $db, int $convId, string $since): array {
    $stmt = $db->prepare("
        SELECT id, conversation_id, sender_id, content, read_at, created_at
        FROM chat_messages
        WHERE conversation_id = ?
          AND created_at > ?
        ORDER BY created_at ASC
        LIMIT 100
    ");
    $stmt->execute([$convId, $since]);
    return $stmt->fetchAll();
}

function markAsRead(PDO $db, int $convId, int $userId): void {
    $stmt = $db->prepare("
        UPDATE chat_messages
        SET read_at = NOW()
        WHERE conversation_id = ?
          AND sender_id != ?
          AND read_at IS NULL
    ");
    $stmt->execute([$convId, $userId]);
}
