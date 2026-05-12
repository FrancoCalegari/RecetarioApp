#!/bin/bash
# install.sh - Script de instalación del Servidor de Chat para Ubuntu

echo "========================================================"
echo "⚙️  Instalando Servidor de Chat (RecetarioApp) en Ubuntu "
echo "========================================================"

# 1. Comprobar si PHP está instalado
if ! command -v php &> /dev/null; then
    echo "❌ PHP no está instalado. Instalando PHP y extensiones requeridas..."
    sudo apt-get update
    sudo apt-get install -y php php-mysql php-cli php-mbstring php-pdo
else
    echo "✅ PHP ya está instalado."
    
    # Comprobar extensiones de PHP necesarias
    MISSING_EXT=0
    if ! php -m | grep -q -i mbstring; then
        echo "⚠️  Extensión mbstring no encontrada, instalando..."
        sudo apt-get install -y php-mbstring
        MISSING_EXT=1
    fi
    if ! php -m | grep -q -i pdo_mysql; then
        echo "⚠️  Extensión pdo_mysql no encontrada, instalando..."
        sudo apt-get install -y php-mysql
        MISSING_EXT=1
    fi
    
    if [ $MISSING_EXT -eq 1 ]; then
        echo "✅ Extensiones de PHP instaladas correctamente."
    fi
fi

# Comprobar si el cliente de MySQL/MariaDB está instalado
if ! command -v mysql &> /dev/null; then
    echo "❌ Cliente de MySQL no encontrado. Instalando mariadb-client..."
    sudo apt-get update
    sudo apt-get install -y mariadb-client
fi

# 2. Leer credenciales desde el archivo .env
cd "$(dirname "$0")" # Asegurar que estamos en la carpeta phpserver/
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ No se encontró el archivo $ENV_FILE. Por favor, créalo copiando .env.example"
    exit 1
fi

echo "📖 Leyendo variables de entorno desde $ENV_FILE..."

# Extraer variables ignorando comentarios
CHAT_DB_NAME=$(grep -v '^#' "$ENV_FILE" | grep 'CHAT_DB_NAME' | cut -d '=' -f2 | xargs)
CHAT_DB_USER=$(grep -v '^#' "$ENV_FILE" | grep 'CHAT_DB_USER' | cut -d '=' -f2 | xargs)
CHAT_DB_PASS=$(grep -v '^#' "$ENV_FILE" | grep 'CHAT_DB_PASS' | cut -d '=' -f2 | xargs)

if [ -z "$CHAT_DB_NAME" ] || [ -z "$CHAT_DB_USER" ]; then
    echo "❌ Faltan las variables CHAT_DB_NAME o CHAT_DB_USER en el archivo .env."
    exit 1
fi

# 3. Crear base de datos y usuario en MySQL
echo "🗄️  Configurando base de datos y usuario en MySQL..."
echo "ℹ️  Nota: Es posible que MySQL te pida tu contraseña de 'root' si sudo mysql falla."

MYSQL_CREATE_USER_QUERY="
CREATE DATABASE IF NOT EXISTS \`${CHAT_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${CHAT_DB_USER}'@'localhost' IDENTIFIED BY '${CHAT_DB_PASS}';
CREATE USER IF NOT EXISTS '${CHAT_DB_USER}'@'%' IDENTIFIED BY '${CHAT_DB_PASS}';
GRANT ALL PRIVILEGES ON \`${CHAT_DB_NAME}\`.* TO '${CHAT_DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${CHAT_DB_NAME}\`.* TO '${CHAT_DB_USER}'@'%';
FLUSH PRIVILEGES;
"

# Intentamos acceder a MySQL con sudo (método por defecto de unix_socket en Ubuntu)
if sudo mysql -e "SELECT 1" &> /dev/null; then
    sudo mysql -e "$MYSQL_CREATE_USER_QUERY"
    if [ $? -eq 0 ]; then
        echo "✅ Base de datos '$CHAT_DB_NAME' y usuario '$CHAT_DB_USER' configurados exitosamente con sudo."
    else
        echo "❌ Error al ejecutar los comandos en MySQL."
        exit 1
    fi
else
    echo "⚠️  No se pudo acceder a MySQL sin contraseña usando sudo."
    echo "🔑 Intentando con usuario root tradicional. Ingresa la contraseña de MySQL:"
    mysql -u root -p -e "$MYSQL_CREATE_USER_QUERY"
    if [ $? -eq 0 ]; then
        echo "✅ Base de datos '$CHAT_DB_NAME' y usuario '$CHAT_DB_USER' configurados exitosamente."
    else
        echo "❌ Falló la configuración en MySQL. Verifica tu contraseña de root."
        exit 1
    fi
fi

# 4. Ejecutar el setup de las tablas
echo "🛠️  Construyendo la estructura de tablas de la base de datos..."
php setup.php

if [ $? -eq 0 ]; then
    echo "========================================================"
    echo "🎉 ¡Instalación completa! El servidor PHP está listo."
    echo "▶️  Para iniciar el servidor, ejecuta: php -S 0.0.0.0:8000 router.php"
    echo "========================================================"
else
    echo "❌ Ocurrió un error al ejecutar setup.php."
    exit 1
fi
