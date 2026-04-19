import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
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
  PORT = 3000,
} = process.env;

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
    // New tables
    `CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTO_INCREMENT, username VARCHAR(50) NOT NULL, email VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL, avatar_file_id INT, bio TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS puntajes_recetas (id INTEGER PRIMARY KEY AUTO_INCREMENT, receta_id INT NOT NULL, usuario_id INT NOT NULL, puntaje INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS puntajes_ingredientes (id INTEGER PRIMARY KEY AUTO_INCREMENT, ingrediente_id INT NOT NULL, usuario_id INT NOT NULL, puntaje INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    // Add columns to recetas (ignore error if already exists)
    `ALTER TABLE recetas ADD COLUMN autor_id INT`,
    `ALTER TABLE recetas ADD COLUMN privacidad VARCHAR(20) DEFAULT 'privado'`,
    // Add columns to ingredientes
    `ALTER TABLE ingredientes ADD COLUMN descripcion TEXT`,
    `ALTER TABLE ingredientes ADD COLUMN foto_file_id INT`,
    `ALTER TABLE ingredientes ADD COLUMN autor_id INT`,
    `ALTER TABLE ingredientes ADD COLUMN privacidad VARCHAR(20) DEFAULT 'privado'`,
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

// ─── AI: Generate Recipe with Gemini ─────────────────────────────────
app.post('/api/ai/generate-recipe', async (req, res) => {
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

    // Get Receti user ID
    const recitiUsers = await sqlSelect(`SELECT id FROM usuarios WHERE username = 'receti'`);
    const recitiId = recitiUsers?.[0]?.id;
    if (!recitiId) return res.status(500).json({ error: 'Usuario Receti no encontrado. Ejecutá /api/db/migrate primero.' });

    // Insert ingredients
    const ingredienteIds = [];
    for (const ing of (recipeData.ingredientes || [])) {
      try {
        let existing = await sqlSelect(`SELECT id FROM ingredientes WHERE nombre = ${esc(ing.nombre)}`);
        let ingId;
        if (existing.length > 0) {
          ingId = existing[0].id;
        } else {
          const r = await sqlQuery(`INSERT INTO ingredientes (nombre, categoria, autor_id, privacidad) VALUES (${esc(ing.nombre)}, ${esc(ing.categoria || 'otros')}, ${recitiId}, 'publico')`);
          ingId = r?.result?.insertId;
        }
        if (ingId) ingredienteIds.push({ id: ingId, cantidad: ing.cantidad, unidad: ing.unidad, nombre: ing.nombre });
      } catch (e) { console.warn('Ingredient insert error:', e.message); }
    }

    // Generar imagen con IA (Pollinations AI como alternativa libre)
    let imagenFileId = 'NULL';
    try {
      const imgPrompt = `Delicious professional food photography of ${recipeData.nombre}. High quality, cinematic lighting, 4k.`;
      const imgRes = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?nologo=true&width=800&height=600`);
      
      if (imgRes.ok) {
        // Upload to Spider-API storage directly
        const { FormData, Blob } = await import('node-fetch');
        const imgBuffer = await imgRes.arrayBuffer();
        const formData = new FormData();
        const blob = new Blob([imgBuffer], { type: 'image/jpeg' });
        formData.append('archivo', blob, { filename: 'ai-recipe.jpg', contentType: 'image/jpeg' });

        const uploadRes = await fetch(`${SPIDER_API_URL}/storage/upload`, {
          method: 'POST',
          headers: { 'X-API-KEY': SPIDER_API_KEY },
          body: formData
        });
        
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.file?.id) {
          imagenFileId = uploadData.file.id;
        }
      }
    } catch (err) {
      console.warn('Error generando o subiendo imagen IA:', err.message);
    }

    // Insert recipe
    const recetaRes = await sqlQuery(
      `INSERT INTO recetas (nombre, descripcion, instrucciones, tiempo_preparacion, porciones, autor_id, privacidad, imagen_file_id) VALUES (${esc(recipeData.nombre)}, ${esc(recipeData.descripcion)}, ${esc(recipeData.instrucciones)}, ${recipeData.tiempo_preparacion || 'NULL'}, ${recipeData.porciones || 'NULL'}, ${recitiId}, 'publico', ${imagenFileId})`
    );
    const recetaId = recetaRes?.result?.insertId;


    // Link ingredients
    for (const ing of ingredienteIds) {
      try {
        await sqlQuery(`INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, unidad) VALUES (${recetaId}, ${ing.id}, ${esc(ing.cantidad)}, ${esc(ing.unidad)})`);
      } catch (e) { console.warn('Link error:', e.message); }
    }

    res.json({
      success: true,
      recetaId,
      receta: { ...recipeData, id: recetaId, autor_id: recitiId },
      ingredientes: ingredienteIds,
    });
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


// ─── Serve static files in production ────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// ─── Start Server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍳 Recetario server running on http://localhost:${PORT}`);
});
