// ─── Vercel Serverless Function ───────────────────────────────────────
// Catches all /api/* requests and routes them through Express.
// Static files (dist/) are served by Vercel CDN — Express never touches them here.
import app from '../server.js';

export default app;
