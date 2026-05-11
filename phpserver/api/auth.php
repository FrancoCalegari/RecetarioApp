<?php
/**
 * RecetarioApp — Chat Server
 * Middleware de autenticación: valida el secret compartido con Node.js
 */

require_once __DIR__ . '/../config/database.php';

function requireAuth(): int {
    // Validar header X-Chat-Secret
    $headers = getallheaders();
    $secret  = $headers['X-Chat-Secret'] ?? $headers['x-chat-secret'] ?? '';

    if (empty($secret) || $secret !== CHAT_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized — invalid chat secret']);
        exit;
    }

    // El user_id del usuario autenticado en RecetarioApp lo envía Node.js
    $userId = (int)($headers['X-User-Id'] ?? $headers['x-user-id'] ?? 0);
    if ($userId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing X-User-Id header']);
        exit;
    }

    return $userId;
}

function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function getRequestBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}
