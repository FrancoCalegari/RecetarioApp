# RecetarioApp — Chat Server (PHP)

Backend de chat en tiempo real para RecetarioApp. Funciona como servidor independiente (PHP + MySQL) que se comunica con el servidor principal de Node.js.

## Estructura

```
phpserver/
├── index.php               # Router principal
├── setup.php               # Instalación de tablas MySQL
├── .htaccess               # Rewrite rules Apache
├── .env.example            # Plantilla de variables de entorno
├── config/
│   └── database.php        # Conexión PDO a MySQL
└── api/
    ├── auth.php            # Middleware de autenticación
    ├── conversations.php   # CRUD de conversaciones
    ├── messages.php        # CRUD de mensajes + long-polling
    └── users.php           # Cache de usuarios
```

## Requisitos

- PHP 8.0+ con extensiones: `pdo`, `pdo_mysql`
- MySQL 5.7+ / MariaDB 10.3+
- Apache con `mod_rewrite` habilitado (o Nginx con configuración equivalente)

## Instalación

### 1. Copiar archivos al servidor

```bash
# Copiar toda la carpeta phpserver/ al servidor destino
scp -r phpserver/ usuario@192.168.1.100:/var/www/html/chat/
```

### 2. Configurar variables de entorno

```bash
cp phpserver/.env.example phpserver/.env
nano phpserver/.env
```

Configurar:
```env
CHAT_DB_HOST=localhost
CHAT_DB_PORT=3306
CHAT_DB_NAME=recetario_chat
CHAT_DB_USER=tu_usuario_mysql
CHAT_DB_PASS=tu_password_mysql
CHAT_SECRET=una_clave_secreta_muy_segura
```

> ⚠️ `CHAT_SECRET` debe coincidir exactamente con `CHAT_SERVER_PASSWORD` en el `.env` de Node.js

### 3. Crear la base de datos MySQL

```sql
CREATE DATABASE recetario_chat
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

### 4. Ejecutar el setup

**Por CLI (recomendado):**
```bash
cd /var/www/html/chat
php setup.php
```

**Por navegador:**
```
http://tu-servidor/chat/setup.php?secret=TU_CHAT_SECRET
```

### 5. Configurar Node.js (.env de RecetarioApp)

```env
CHAT_SERVER_IP=192.168.1.100
CHAT_SERVER_USER=admin
CHAT_SERVER_PASSWORD=una_clave_secreta_muy_segura
```

El `CHAT_SERVER_USER` es informativo (nombre del server), el `CHAT_SERVER_PASSWORD` es el secret compartido.

## Endpoints

| Método | Ruta                          | Descripción                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/api/health`                 | Health check (sin autenticación)         |
| GET    | `/api/conversations`          | Lista conversaciones del usuario         |
| POST   | `/api/conversations`          | Crear/obtener conversación               |
| GET    | `/api/conversations/:id`      | Detalle de conversación                  |
| GET    | `/api/messages?conversation_id=X` | Obtener mensajes                    |
| GET    | `/api/messages?conversation_id=X&since=T&poll=1` | Long-polling |
| POST   | `/api/messages`               | Enviar mensaje                           |
| PUT    | `/api/messages/read?conversation_id=X` | Marcar mensajes como leídos   |
| GET    | `/api/users`                  | Lista usuarios disponibles (cache)       |
| POST   | `/api/users/sync`             | Node.js sincroniza usuarios              |

## Autenticación

Todos los endpoints (excepto `/api/health`) requieren dos headers:

```
X-Chat-Secret: TU_CHAT_SECRET
X-User-Id: 123
```

- `X-Chat-Secret`: el secret compartido (CHAT_SERVER_PASSWORD en Node.js)
- `X-User-Id`: el ID del usuario autenticado en RecetarioApp (lo inyecta Node.js luego de validar el JWT)

## Configuración Nginx (alternativa a Apache)

```nginx
location /chat/ {
    root /var/www/html;
    index index.php;
    try_files $uri $uri/ /chat/index.php?$query_string;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

## Verificar que funciona

```bash
curl http://tu-servidor/chat/api/health
# Respuesta: {"status":"ok","db":"connected","time":"..."}
```
