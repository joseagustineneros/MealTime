// Manejador de POST /auth/google. El router (issue X1) solo debe conectarlo.
import type { Rol } from './authz';
import { firmarSesion } from './auth';
import { verificarIdTokenGoogle } from './google';
import { usuarioDesdeGoogle } from './datos';
import { ErrorHttp } from './http';

export interface EnvLogin { DB: D1Database; SESSION_SECRET: string; GOOGLE_CLIENT_ID: string }

const esRol = (r: unknown): r is Rol => r === 'paciente' || r === 'nutricionista';

/** `{idToken, rol?}`: `rol` es obligatorio solo al crear la cuenta. */
export async function loginGoogle(body: unknown, env: EnvLogin, fetchFn?: typeof fetch) {
  const b = (body ?? {}) as { idToken?: unknown; rol?: unknown };
  if (typeof b.idToken !== 'string') return { status: 400, data: { error: 'datos_invalidos', message: 'Falta idToken' } };
  if (b.rol !== undefined && !esRol(b.rol)) {
    return { status: 400, data: { error: 'rol_invalido', message: 'El rol debe ser "paciente" o "nutricionista"' } };
  }
  const ident = await verificarIdTokenGoogle(b.idToken, env.GOOGLE_CLIENT_ID, { fetchFn });
  if (!ident) return { status: 401, data: { error: 'no_autenticado', message: 'Token de Google inválido' } };
  try {
    const actor = await usuarioDesdeGoogle(env.DB, ident, b.rol);
    return { status: 200, data: { token: await firmarSesion(actor, env.SESSION_SECRET), user: actor } };
  } catch (e) {
    if (e instanceof ErrorHttp) return { status: e.status, data: { error: e.codigo, message: e.message } };
    throw e;
  }
}
