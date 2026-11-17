// Manejador de POST /auth/google. El router (issue X1) solo debe conectarlo.
import type { Rol } from './authz';
import { firmarSesion } from './auth';
import { verificarIdTokenGoogle } from './google';
import { usuarioDesdeGoogle } from './datos';

export interface EnvLogin { DB: D1Database; SESSION_SECRET: string; GOOGLE_CLIENT_ID: string }

export async function loginGoogle(body: unknown, env: EnvLogin, fetchFn?: typeof fetch) {
  const b = (body ?? {}) as { idToken?: unknown; rol?: unknown };
  if (typeof b.idToken !== 'string') return { status: 400, data: { error: 'datos_invalidos', message: 'Falta idToken' } };
  const rol: Rol = b.rol === 'nutricionista' ? 'nutricionista' : 'paciente';
  const ident = await verificarIdTokenGoogle(b.idToken, env.GOOGLE_CLIENT_ID, { fetchFn });
  if (!ident) return { status: 401, data: { error: 'no_autenticado', message: 'Token de Google inválido' } };
  const actor = await usuarioDesdeGoogle(env.DB, ident, rol);
  return { status: 200, data: { token: await firmarSesion(actor, env.SESSION_SECRET), user: actor } };
}
