// Punto de entrada del Worker: router.
import { actorDe } from './auth';
import { json, leerJson, respuestaDeError } from './http';
import { loginGoogle } from './login';
import { aceptarInvitacion, crearInvitacion, listarVinculos, revocarVinculo } from './routes/vinculos';

export interface Env {
  DB: D1Database;
  CONSENTIMIENTO_VIGENTE: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    const m = req.method;
    try {
      if (pathname === '/salud') return json({ ok: true });
      if (m === 'POST' && pathname === '/auth/google') {
        const r = await loginGoogle(await leerJson(req), env);
        return json(r.data, r.status);
      }

      const actor = await actorDe(req, env.SESSION_SECRET);
      if (m === 'GET' && pathname === '/me') return json({ user: actor });
      if (m === 'POST' && pathname === '/invites') return await crearInvitacion(env.DB, actor);
      if (m === 'POST' && pathname === '/links/accept') return await aceptarInvitacion(env.DB, actor, req, env.CONSENTIMIENTO_VIGENTE);
      if (m === 'GET' && pathname === '/links') return await listarVinculos(env.DB, actor);
      const del = /^\/links\/([\w-]{1,64})$/.exec(pathname);
      if (m === 'DELETE' && del) return await revocarVinculo(env.DB, actor, del[1]);

      return json({ error: 'no_encontrado', message: 'Ruta no encontrada' }, 404);
    } catch (e) {
      return respuestaDeError(e);
    }
  },
};
