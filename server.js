import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const {
  SPIDER_API_KEY,
  SPIDER_API_DB,
  SPIDER_API_STORAGE_ID,
  SPIDER_API_URL,
  JWT_SECRET = 'recetario_jwt_secret_2025',
  GEMINI_API_KEY,
  EMAIL_USER,
  EMAIL_PASS,
  PORT = 3000,
} = process.env;

// ─── Email Transporter (Nodemailer + Gmail) ───────────────────────
const emailTransporter = (EMAIL_USER && EMAIL_PASS)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    })
  : null;

// ─── Detect base URL from request (localhost vs production) ──────
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

// ─── Send password reset email ───────────────────────────────────
async function sendResetEmail(to, username, resetLink) {
  if (!emailTransporter) throw new Error('Servicio de email no configurado. Agregá EMAIL_USER y EMAIL_PASS al .env');

  await emailTransporter.sendMail({
    from: `"Recetario 🍳" <${EMAIL_USER}>`,
    to,
    subject: '🔑 Recuperá tu contraseña — Recetario',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0F1419; color: #E8EAF0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #E8734A, #4CAF7D); padding: 32px; text-align: center;">
          <div style="font-size: 48px;">🍳</div>
          <h1 style="color: white; margin: 8px 0; font-size: 24px;">Recetario</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #E8EAF0; margin-top: 0;">Hola, ${username} 👋</h2>
          <p style="color: #A0A8B8; line-height: 1.6;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en Recetario.</p>
          <p style="color: #A0A8B8; line-height: 1.6;">Hacé click en el botón para crear una nueva contraseña. El link es válido por <strong style="color: #E8EAF0;">1 hora</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}" style="background: linear-gradient(135deg, #E8734A, #cf6540); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Restablecer contraseña</a>
          </div>
          <p style="color: #606880; font-size: 13px; line-height: 1.6;">Si no solicitaste esto, podés ignorar este email. Tu contraseña no cambiará.</p>
          <p style="color: #606880; font-size: 12px; margin-top: 24px; border-top: 1px solid #1E2832; padding-top: 16px;">O copiá este link en tu navegador:<br><a href="${resetLink}" style="color: #4CAF7D; word-break: break-all;">${resetLink}</a></p>
        </div>
      </div>
    `,
  });
}

// ID fijo del usuario Receti (se crea en migrate)
const RECETI_USERNAME = 'receti';


// ─── Helpers SQL ─────────────────────────────────────────────────────
async function sqlQuery(query) {
  const response = await fetch(`${SPIDER_API_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': SPIDER_API_KEY },
    body: JSON.stringify({ database: SPIDER_API_DB, query }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.message || data.error);
  return data;
}

async function sqlSelect(query) {
  const resp = await sqlQuery(query);
  const data = resp?.result ?? resp?.data ?? resp?.rows ?? resp;
  return Array.isArray(data) ? data : [];
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Middleware ───────────────────────────────────────────────────────
app.use(express.json());

// ─── JWT Auth Middleware ──────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

// ─── AUTH: Register ───────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    // Check unique
    const existing = await sqlSelect(
      `SELECT id FROM usuarios WHERE username = ${esc(username)} OR email = ${esc(email)}`
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'El usuario o email ya existe' });

    const hash = await bcrypt.hash(password, 10);
    const result = await sqlQuery(
      `INSERT INTO usuarios (username, email, password_hash) VALUES (${esc(username)}, ${esc(email)}, ${esc(hash)})`
    );
    const userId = result?.result?.insertId;

    const token = jwt.sign({ id: userId, username, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: userId, username, email, avatar_file_id: null, bio: null } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error al registrar usuario', details: err.message });
  }
});

// ─── AUTH: Login ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  try {
    const users = await sqlSelect(
      `SELECT * FROM usuarios WHERE username = ${esc(username)} OR email = ${esc(username)}`
    );
    if (users.length === 0)
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_file_id: user.avatar_file_id,
        bio: user.bio,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión', details: err.message });
  }
});

// ─── AUTH: Me ─────────────────────────────────────────────────────────
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const users = await sqlSelect(`SELECT id, username, email, avatar_file_id, bio FROM usuarios WHERE id = ${req.user.id}`);
    if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ success: true, user: users[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo perfil' });
  }
});

// ─── AUTH: Update Profile ─────────────────────────────────────────────
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { bio } = req.body;
  try {
    await sqlQuery(`UPDATE usuarios SET bio = ${esc(bio)} WHERE id = ${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
});

// ─── AUTH: Update Avatar ──────────────────────────────────────────────
app.put('/api/auth/avatar', authenticateToken, async (req, res) => {
  const { avatar_file_id } = req.body;
  try {
    await sqlQuery(`UPDATE usuarios SET avatar_file_id = ${avatar_file_id || 'NULL'} WHERE id = ${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando avatar' });
  }
});

// ─── RATINGS: Rate Recipe ─────────────────────────────────────────────
app.post('/api/ratings/receta/:id', authenticateToken, async (req, res) => {
  const { puntaje } = req.body;
  const recetaId = req.params.id;
  if (!puntaje || puntaje < 1 || puntaje > 10)
    return res.status(400).json({ error: 'Puntaje debe ser entre 1 y 10' });

  try {
    // Check if already voted
    const existing = await sqlSelect(
      `SELECT id FROM puntajes_recetas WHERE receta_id = ${recetaId} AND usuario_id = ${req.user.id}`
    );
    if (existing.length > 0) {
      await sqlQuery(`UPDATE puntajes_recetas SET puntaje = ${puntaje} WHERE receta_id = ${recetaId} AND usuario_id = ${req.user.id}`);
    } else {
      await sqlQuery(`INSERT INTO puntajes_recetas (receta_id, usuario_id, puntaje) VALUES (${recetaId}, ${req.user.id}, ${puntaje})`);
    }

    // Return new average
    const avg = await sqlSelect(
      `SELECT AVG(puntaje) as promedio, COUNT(*) as total FROM puntajes_recetas WHERE receta_id = ${recetaId}`
    );
    res.json({ success: true, promedio: parseFloat(avg[0]?.promedio || 0).toFixed(1), total: avg[0]?.total || 0 });
  } catch (err) {
    console.error('Rate recipe error:', err);
    res.status(500).json({ error: 'Error al calificar' });
  }
});

// ─── RATINGS: Rate Ingredient ─────────────────────────────────────────
app.post('/api/ratings/ingrediente/:id', authenticateToken, async (req, res) => {
  const { puntaje } = req.body;
  const ingId = req.params.id;
  if (!puntaje || puntaje < 1 || puntaje > 10)
    return res.status(400).json({ error: 'Puntaje debe ser entre 1 y 10' });

  try {
    const existing = await sqlSelect(
      `SELECT id FROM puntajes_ingredientes WHERE ingrediente_id = ${ingId} AND usuario_id = ${req.user.id}`
    );
    if (existing.length > 0) {
      await sqlQuery(`UPDATE puntajes_ingredientes SET puntaje = ${puntaje} WHERE ingrediente_id = ${ingId} AND usuario_id = ${req.user.id}`);
    } else {
      await sqlQuery(`INSERT INTO puntajes_ingredientes (ingrediente_id, usuario_id, puntaje) VALUES (${ingId}, ${req.user.id}, ${puntaje})`);
    }

    const avg = await sqlSelect(
      `SELECT AVG(puntaje) as promedio, COUNT(*) as total FROM puntajes_ingredientes WHERE ingrediente_id = ${ingId}`
    );
    res.json({ success: true, promedio: parseFloat(avg[0]?.promedio || 0).toFixed(1), total: avg[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Error al calificar' });
  }
});

// ─── PUBLIC: Get user profile ─────────────────────────────────────────
app.get('/api/users/:id', async (req, res) => {
  try {
    const users = await sqlSelect(`SELECT id, username, avatar_file_id, bio, created_at FROM usuarios WHERE id = ${req.params.id}`);
    if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ success: true, user: users[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

// ─── API Proxy: SQL Query (generic) ──────────────────────────────────
app.post('/api/query', async (req, res) => {
  try {
    const data = await sqlQuery(req.body.query);
    res.json(data);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Error ejecutando query', details: err.message });
  }
});

// ─── API Proxy: Upload Files ──────────────────────────────────────────
app.post('/api/storage/upload', upload.single('file'), async (req, res) => {
  try {
    const { buffer, originalname, mimetype } = req.file;
    const { FormData, Blob } = await import('node-fetch');
    const blob = new Blob([buffer], { type: mimetype });
    const formData = new FormData();
    formData.append('files', blob, originalname);

    const response = await fetch(
      `${SPIDER_API_URL}/storage/projects/${SPIDER_API_STORAGE_ID}/files`,
      { method: 'POST', headers: { 'X-API-KEY': SPIDER_API_KEY }, body: formData }
    );
    res.json(await response.json());
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error subiendo archivo', details: err.message });
  }
});

// ─── API Proxy: Get File ──────────────────────────────────────────────
app.get('/api/storage/files/:id', async (req, res) => {
  try {
    const response = await fetch(
      `${SPIDER_API_URL}/storage/files/${req.params.id}`,
      { headers: { 'X-API-KEY': SPIDER_API_KEY } }
    );
    const ct = response.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo archivo' });
  }
});

// ─── API Proxy: Delete File ───────────────────────────────────────────
app.delete('/api/storage/files/:id', async (req, res) => {
  try {
    const response = await fetch(
      `${SPIDER_API_URL}/storage/files/${req.params.id}`,
      { method: 'DELETE', headers: { 'X-API-KEY': SPIDER_API_KEY } }
    );
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando archivo' });
  }
});

// ─── API Proxy: File Info ─────────────────────────────────────────────
app.get('/api/storage/files/:id/info', async (req, res) => {
  try {
    const response = await fetch(
      `${SPIDER_API_URL}/storage/files/${req.params.id}/info`,
      { headers: { 'X-API-KEY': SPIDER_API_KEY } }
    );
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo info' });
  }
});

// ─── DB Init ─────────────────────────────────────────────────────────
app.post('/api/db/init', async (_req, res) => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS ingredientes (id INTEGER PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(255) NOT NULL, categoria VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS recetas (id INTEGER PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(255) NOT NULL, descripcion TEXT, instrucciones TEXT, tiempo_preparacion INT, porciones INT DEFAULT 1, imagen_file_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS receta_ingredientes (id INTEGER PRIMARY KEY AUTO_INCREMENT, receta_id INT NOT NULL, ingrediente_id INT NOT NULL, cantidad VARCHAR(100), unidad VARCHAR(50))`,
    `CREATE TABLE IF NOT EXISTS planificacion_semanal (id INTEGER PRIMARY KEY AUTO_INCREMENT, fecha DATE NOT NULL, momento VARCHAR(20) NOT NULL, receta_id INT, nota TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS registro_extras (id INTEGER PRIMARY KEY AUTO_INCREMENT, fecha DATE NOT NULL, descripcion TEXT NOT NULL, momento VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  ];
  try {
    const results = [];
    for (const query of tables) results.push(await sqlQuery(query));
    res.json({ success: true, message: 'Tablas base OK', results });
  } catch (err) {
    res.status(500).json({ error: 'Error init DB', details: err.message });
  }
});

// ─── DB Migrate: Users & Ratings ────────────────────────────────────
app.post('/api/db/migrate', async (_req, res) => {
  const migrations = [
    // Core tables
    `CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTO_INCREMENT, username VARCHAR(50) NOT NULL, email VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL, avatar_file_id INT, bio TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS puntajes_recetas (id INTEGER PRIMARY KEY AUTO_INCREMENT, receta_id INT NOT NULL, usuario_id INT NOT NULL, puntaje INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS puntajes_ingredientes (id INTEGER PRIMARY KEY AUTO_INCREMENT, ingrediente_id INT NOT NULL, usuario_id INT NOT NULL, puntaje INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    // Password reset tokens
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (id INTEGER PRIMARY KEY AUTO_INCREMENT, usuario_id INT NOT NULL, token VARCHAR(255) NOT NULL UNIQUE, expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    // Add columns to recetas (ignore error if already exists)
    `ALTER TABLE recetas ADD COLUMN autor_id INT`,
    `ALTER TABLE recetas ADD COLUMN privacidad VARCHAR(20) DEFAULT 'privado'`,
    `ALTER TABLE recetas ADD COLUMN generado_ia BOOLEAN DEFAULT FALSE`,
    // Add columns to ingredientes
    `ALTER TABLE ingredientes ADD COLUMN descripcion TEXT`,
    `ALTER TABLE ingredientes ADD COLUMN foto_file_id INT`,
    `ALTER TABLE ingredientes ADD COLUMN autor_id INT`,
    `ALTER TABLE ingredientes ADD COLUMN privacidad VARCHAR(20) DEFAULT 'privado'`,
    // Add usuario_id to planificacion_semanal (each user has their own planner)
    `ALTER TABLE planificacion_semanal ADD COLUMN usuario_id INT`,
  ];

  const results = [];
  for (const query of migrations) {
    try {
      const r = await sqlQuery(query);
      results.push({ query: query.substring(0, 60) + '...', ok: true, result: r });
    } catch (err) {
      results.push({ query: query.substring(0, 60) + '...', ok: false, error: err.message });
    }
  }

  // Ensure Receti bot user exists
  try {
    const existing = await sqlSelect(`SELECT id FROM usuarios WHERE username = 'receti'`);
    if (existing.length === 0) {
      await sqlQuery(`INSERT INTO usuarios (username, email, password_hash, bio) VALUES ('receti', 'receti@recetarioapp.ai', 'NO_LOGIN', 'Soy Receti 🤖, el chef robot de RecetarioApp. Genero recetas con Inteligencia Artificial.')`);
      results.push({ query: 'INSERT receti user...', ok: true });
    } else {
      results.push({ query: 'receti user already exists...', ok: true });
    }
  } catch (err) {
    results.push({ query: 'INSERT receti user...', ok: false, error: err.message });
  }

  res.json({ success: true, message: 'Migración completada', results });
});

// ─── AUTH: Forgot Password ────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'El email es requerido' });

  try {
    // Always respond with success to avoid user enumeration
    const users = await sqlSelect(`SELECT id, username, email FROM usuarios WHERE email = ${esc(email)}`);
    if (users.length === 0) {
      return res.json({ success: true, message: 'Si el email existe, recibirás un correo con instrucciones.' });
    }

    const user = users[0];

    // Invalidate any existing tokens for this user
    await sqlQuery(`UPDATE password_reset_tokens SET used = TRUE WHERE usuario_id = ${user.id} AND used = FALSE`)
      .catch(() => {}); // Ignore if table doesn't exist yet

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const expiresAtSQL = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await sqlQuery(
      `INSERT INTO password_reset_tokens (usuario_id, token, expires_at) VALUES (${user.id}, ${esc(token)}, ${esc(expiresAtSQL)})`
    );

    // Build reset link using the request's actual host/protocol
    const baseUrl = getBaseUrl(req);
    const resetLink = `${baseUrl}/#/reset-password?token=${token}`;

    await sendResetEmail(user.email, user.username, resetLink);

    console.log(`[Auth] Reset email sent to ${user.email} | Link: ${resetLink}`);
    res.json({ success: true, message: 'Si el email existe, recibirás un correo con instrucciones.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: err.message || 'Error al enviar el correo de recuperación' });
  }
});

// ─── AUTH: Reset Password ─────────────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    // Find valid token
    const tokens = await sqlSelect(
      `SELECT prt.*, u.id as uid, u.username, u.email
       FROM password_reset_tokens prt
       JOIN usuarios u ON u.id = prt.usuario_id
       WHERE prt.token = ${esc(token)}
         AND prt.used = FALSE
         AND prt.expires_at > NOW()`
    );

    if (tokens.length === 0) {
      return res.status(400).json({ error: 'El link de recuperación es inválido o ya expiró. Solicitá uno nuevo.' });
    }

    const resetEntry = tokens[0];

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update password
    await sqlQuery(`UPDATE usuarios SET password_hash = ${esc(hash)} WHERE id = ${resetEntry.uid}`);

    // Mark token as used
    await sqlQuery(`UPDATE password_reset_tokens SET used = TRUE WHERE id = ${resetEntry.id}`);

    console.log(`[Auth] Password reset successful for user: ${resetEntry.username}`);
    res.json({ success: true, message: '¡Contraseña actualizada! Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

// ─── AI: Generate Recipe with Gemini (stateless — only queries Gemini, no DB writes)
app.post('/api/ai/generate-recipe', authenticateToken, async (req, res) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'TU_API_KEY_AQUI') {
    return res.status(503).json({ error: 'API key de Gemini no configurada. Agregá GEMINI_API_KEY al archivo .env' });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'El prompt es requerido' });

  const systemPrompt = `Eres Receti, un robot chef argentino experto en cocina. Tu misión es generar recetas.
¡IMPORTANTE! Para ahorrar tokens, debes ser EXTREMADAMENTE CORTO Y CONCISO.
- Las instrucciones deben ser pasos muy breves.
- La descripción de máximo 1 línea.
Siempre respondés en español rioplatense.
Respondé ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "nombre": "Nombre receta",
  "descripcion": "Descripción corta de 1 línea.",
  "instrucciones": "1. ...\n2. ...",
  "tiempo_preparacion": 30,
  "porciones": 4,
  "ingredientes": [
    { "nombre": "Ingrediente", "cantidad": "200", "unidad": "gr", "categoria": "animal" }
  ]
}
Categorías: mineral, aceite, animal, vegetal, legumbre, lacteo, cereal, condimento, otros.
NO incluyas texto adicional fuera del JSON.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      console.error('Gemini API error:', errData);
      return res.status(502).json({ error: 'Error al conectar con Gemini', details: errData?.error?.message });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return res.status(502).json({ error: 'Gemini no devolvió contenido' });

    let recipeData;
    try {
      recipeData = JSON.parse(rawText);
    } catch {
      return res.status(502).json({ error: 'Gemini devolvió JSON inválido', raw: rawText });
    }

    // ✅ Return raw recipe data — frontend saves to DB with user's own token
    console.log(`[AI] Recipe generated for user ${req.user.id}: "${recipeData.nombre}"`);
    res.json({ success: true, recipeData });
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Error generando receta con IA', details: err.message });
  }
});

// ─── AI: Status check ────────────────────────────────────────────────
app.get('/api/ai/status', (_req, res) => {
  res.json({
    available: !!(GEMINI_API_KEY && GEMINI_API_KEY !== 'TU_API_KEY_AQUI'),
    model: 'gemini-2.0-flash',
  });
});


// ─── Serve static files in production (local only) ───────────────────
// On Vercel, static files are served by the CDN from dist/ directly.
// Express only handles /api/* in serverless context.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// ─── Start Server (local only) ────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🍳 Recetario server running on http://localhost:${PORT}`);
  });
}

// ─── Export for Vercel serverless ─────────────────────────────────────
export default app;
