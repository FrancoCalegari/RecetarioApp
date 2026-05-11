<?php
/**
 * RecetarioApp — Chat Server
 * Router principal — todos los requests entran aquí gracias al .htaccess
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Chat-Secret, X-User-Id');

// Responder preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$path  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts = array_values(array_filter(explode('/', $path)));

// Esperamos: /api/{resource}/...
// $parts[0] podría ser 'api' si el servidor sirve desde /
$offset = ($parts[0] ?? '') === 'api' ? 1 : 0;
$resource = $parts[$offset] ?? '';

switch ($resource) {
    case 'conversations':
        require __DIR__ . '/api/conversations.php';
        break;

    case 'messages':
        require __DIR__ . '/api/messages.php';
        break;

    case 'users':
        require __DIR__ . '/api/users.php';
        break;

    case 'health':
        // Health check — no requiere autenticación
        require_once __DIR__ . '/config/database.php';
        try {
            $db = getDB();
            $db->query('SELECT 1');
            echo json_encode(['status' => 'ok', 'db' => 'connected', 'time' => date('c')]);
        } catch (Exception $e) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'db' => 'disconnected', 'error' => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint not found', 'path' => $path]);
}
