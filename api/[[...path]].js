// ─── Vercel Serverless Handler ────────────────────────────────────────
// Explicit handler wrapping Express — catches ALL /api/* requests.
// Vercel passes the full path (e.g. /api/auth/login) so Express routing works as-is.
import app from '../server.js';

export default function handler(req, res) {
  // Ensure JSON error if something goes wrong before Express can respond
  res.setHeader('Content-Type', 'application/json');
  return app(req, res);
}
