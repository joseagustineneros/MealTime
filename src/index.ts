// Punto de entrada del Worker: router.
import { actorDe } from './auth';
import { json, leerJson, respuestaDeError } from './http';
import { loginGoogle } from './login';
import { decidirPlan, planActivo, planesPendientes, proponerPlan, reemplazarPlanPropio } from './routes/planes';
import { guardarRegistros, listarPacientes, registrosPaciente } from './routes/registros';
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


      if (m === 'GET' && pathname === '/plans/active') return await planActivo(env.DB, actor, actor.id);
      if (m === 'PUT' && pathname === '/plans/active') return await reemplazarPlanPropio(env.DB, actor, req);
      if (m === 'GET' && pathname === '/plans/pending') return await planesPendientes(env.DB, actor);
      const dec = /^\/plans\/([\w-]{1,64})\/(accept|reject)$/.exec(pathname);
      if (m === 'POST' && dec) return await decidirPlan(env.DB, actor, dec[1], dec[2] === 'accept');
      if (m === 'POST' && pathname === '/logs') return await guardarRegistros(env.DB, actor, req);

      if (m === 'GET' && pathname === '/patients') return await listarPacientes(env.DB, actor);
      const pac = /^\/patients\/([\w-]{1,64})\/(plan|plans|logs)$/.exec(pathname);
      if (pac) {
        const [, id, sub] = pac;
        if (m === 'GET' && sub === 'plan') return await planActivo(env.DB, actor, id);
        if (m === 'POST' && sub === 'plans') return await proponerPlan(env.DB, actor, id, req);
        if (m === 'GET' && sub === 'logs') return await registrosPaciente(env.DB, actor, id, new URL(req.url));
      }

      return json({ error: 'no_encontrado', message: 'Ruta no encontrada' }, 404);
    } catch (e) {
      return respuestaDeError(e);
    }
  },
};
