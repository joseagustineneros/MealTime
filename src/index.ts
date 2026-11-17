// Punto de entrada del Worker. Las rutas se agregan en src/routes/* (issues de Codex).
import { getMe, postAuthGoogle } from './cuentas';
import { json, manejar } from './http';

export interface Env {
  DB: D1Database;
  CONSENTIMIENTO_VIGENTE: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/salud') return json({ ok: true });
    if (req.method === 'POST' && url.pathname === '/auth/google') return manejar(() => postAuthGoogle(req, env));
    if (req.method === 'GET' && url.pathname === '/me') return manejar(() => getMe(req, env));
    return json({ error: 'no_encontrado', message: 'Ruta no encontrada' }, 404);
  },
};
