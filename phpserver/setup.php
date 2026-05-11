<?php
/**
 * RecetarioApp — Chat Server
 * Script de instalación — crear tablas MySQL
 *
 * Uso: php setup.php
 *   o abrir en el navegador: http://tu-servidor/chat/setup.php?secret=TU_SECRET
 */

// ── Leer variables de entorno desde .env si existe ───────────────────
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        if (!str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        putenv(trim($key) . '=' . trim($val));
    }
}

require_once __DIR__ . '/config/database.php';

// Protección básica: si se accede por HTTP, verificar secret
if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    $secret = $_GET['secret'] ?? '';
    if ($secret !== CHAT_SECRET) {
        http_response_code(403);
        echo "403 Forbidden — proporciona ?secret=TU_CHAT_SECRET para ejecutar el setup\n";
        exit;
    }
}

echo "=== RecetarioApp Chat Server — Setup ===\n\n";

$db = getDB();

$tables = [
    'chat_users_cache' => "
        CREATE TABLE IF NOT EXISTS chat_users_cache (
            user_id        INT NOT NULL PRIMARY KEY,
            username       VARCHAR(100) NOT NULL,
            avatar_file_id INT NULL,
            updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ",

    'chat_conversations' => "
        CREATE TABLE IF NOT EXISTS chat_conversations (
            id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user1_id   INT NOT NULL,
            user2_id   INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_conv (user1_id, user2_id),
            INDEX idx_user1 (user1_id),
            INDEX idx_user2 (user2_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ",

    'chat_messages' => "
        CREATE TABLE IF NOT EXISTS chat_messages (
            id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id       INT NOT NULL,
            content         TEXT NOT NULL,
            read_at         TIMESTAMP NULL DEFAULT NULL,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_conv    (conversation_id),
            INDEX idx_created (created_at),
            CONSTRAINT fk_msg_conv
                FOREIGN KEY (conversation_id)
                REFERENCES chat_conversations(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ",
];

$allOk = true;
foreach ($tables as $name => $sql) {
    try {
        $db->exec($sql);
        echo "✅ Tabla '$name' OK\n";
    } catch (PDOException $e) {
        echo "❌ Error en tabla '$name': " . $e->getMessage() . "\n";
        $allOk = false;
    }
}

echo "\n";
if ($allOk) {
    echo "✅ Setup completo. El servidor de chat está listo.\n";
    echo "   Accedé a /api/health para verificar la conexión.\n";
} else {
    echo "⚠️  Hubo errores. Revisá la configuración de la BD.\n";
}
echo "\n";
