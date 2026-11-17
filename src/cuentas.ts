// Alta e ingreso de usuarios con Google. Núcleo de seguridad: cambios solo con aprobación de Claude.
import type { Rol } from './authz';
import { actorDe, firmarSesion } from './auth';
import { clavesGoogle, verificarIdToken, type IdentidadGoogle, type ObtenerClaves } from './google';
import { registrarAuditoria } from './datos';
import { ErrorApi, cuerpoJson, json } from './http';
import type { Env } from './index';

export interface Usuario { id: string; email: string; nombre: string; rol: Rol }

const esRol = (r: unknown): r is Rol => r === 'paciente' || r === 'nutricionista';

const porSub = (db: D1Database, sub: string) =>
  db.prepare('SELECT id, email, nombre, rol FROM users WHERE google_sub = ?').bind(sub).first<Usuario>();

/**
 * Ingresa a un usuario existente o lo crea con `rolPedido`.
 * Un usuario tiene un solo rol: pedir otro distinto responde 409.
 */
export async function ingresarOCrear(db: D1Database, ident: IdentidadGoogle, rolPedido?: unknown): Promise<Usuario> {
  if (rolPedido !== undefined && !esRol(rolPedido)) {
    throw new ErrorApi(400, 'rol_invalido', 'El rol debe ser "paciente" o "nutricionista"');
  }
  const existente = await porSub(db, ident.sub);
  if (existente) {
    if (rolPedido !== undefined && rolPedido !== existente.rol) {
      throw new ErrorApi(409, 'rol_distinto', `Esta cuenta ya está registrada como ${existente.rol}`);
    }
    if (existente.email !== ident.email || (ident.nombre && existente.nombre !== ident.nombre)) {
      const nombre = ident.nombre || existente.nombre;
      await db.prepare('UPDATE users SET email = ?, nombre = ? WHERE id = ?').bind(ident.email, nombre, existente.id).run();
      return { ...existente, email: ident.email, nombre };
    }
    return existente;
  }
  if (rolPedido === undefined) {
    throw new ErrorApi(400, 'rol_requerido', 'Cuenta nueva: indica el rol ("paciente" o "nutricionista")');
  }
  const id = crypto.randomUUID();
  try {
    await db.prepare('INSERT INTO users (id, google_sub, email, nombre, rol) VALUES (?, ?, ?, ?, ?)')
      .bind(id, ident.sub, ident.email, ident.nombre, rolPedido).run();
  } catch (e) {
    // Alta simultánea del mismo google_sub: gana la primera.
    const otra = await porSub(db, ident.sub);
    if (!otra) throw e;
    if (otra.rol !== rolPedido) throw new ErrorApi(409, 'rol_distinto', `Esta cuenta ya está registrada como ${otra.rol}`);
    return otra;
  }
  await registrarAuditoria(db, id, 'cuenta.crear', id);
  return { id, email: ident.email, nombre: ident.nombre, rol: rolPedido };
}

/** `POST /auth/google` `{idToken, rol?}` → `{token, user}`. `rol` solo se usa al crear la cuenta. */
export async function postAuthGoogle(req: Request, env: Env, obtener: ObtenerClaves = clavesGoogle): Promise<Response> {
  const b = await cuerpoJson(req);
  if (typeof b.idToken !== 'string' || !b.idToken) throw new ErrorApi(400, 'id_token_requerido', 'Falta idToken');
  const ident = await verificarIdToken(b.idToken, env.GOOGLE_CLIENT_ID, obtener);
  const user = await ingresarOCrear(env.DB, ident, b.rol);
  const token = await firmarSesion({ id: user.id, rol: user.rol }, env.SESSION_SECRET);
  return json({ token, user });
}

/** `GET /me` → usuario de la sesión. 401 si la cuenta ya no existe. */
export async function getMe(req: Request, env: Env): Promise<Response> {
  const a = await actorDe(req, env.SESSION_SECRET);
  const u = await env.DB.prepare('SELECT id, email, nombre, rol FROM users WHERE id = ?').bind(a.id).first<Usuario>();
  if (!u) throw new ErrorApi(401, 'no_autenticado', 'La cuenta no existe');
  return json(u);
}
