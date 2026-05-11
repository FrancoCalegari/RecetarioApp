<?php
/**
 * RecetarioApp — Chat Server
 * Conexión a la base de datos MySQL del chat
 */

define('DB_HOST', getenv('CHAT_DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('CHAT_DB_PORT') ?: '3306');
define('DB_NAME', getenv('CHAT_DB_NAME') ?: 'recetario_chat');
define('DB_USER', getenv('CHAT_DB_USER') ?: 'root');
define('DB_PASS', getenv('CHAT_DB_PASS') ?: '');

// Secret compartido con Node.js (debe coincidir con CHAT_SERVER_PASSWORD en .env de Node)
define('CHAT_SECRET', getenv('CHAT_SECRET') ?: 'change_me_in_production');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT, DB_NAME
    );

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        if (PHP_SAPI === 'cli') {
            echo "❌ Database connection failed: " . $e->getMessage() . "\n";
            exit(1);
        }
        http_response_code(503);
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit;
    }

    return $pdo;
}
