// Sesiones firmadas (HMAC-SHA256). Núcleo de seguridad: cambios solo con aprobación de Claude.
// El idToken de Google se verifica en src/google.ts; el alta, en src/cuentas.ts. Las rutas usan solo actorDe().
import type { Actor, Rol } from './authz';

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function clave(secreto: string) {
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export const DURACION_SESION_S = 30 * 24 * 3600;

export async function firmarSesion(actor: Actor, secreto: string, ahoraS = Math.floor(Date.now() / 1000)) {
  const cuerpo = b64url(enc.encode(JSON.stringify({ sub: actor.id, rol: actor.rol, exp: ahoraS + DURACION_SESION_S })));
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), enc.encode(cuerpo));
  return `${cuerpo}.${b64url(firma)}`;
}

export async function verificarSesion(token: string, secreto: string, ahoraS = Math.floor(Date.now() / 1000)): Promise<Actor | null> {
  const [cuerpo, firma, extra] = token.split('.');
  if (!cuerpo || !firma || extra !== undefined) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await clave(secreto), desdeB64url(firma), enc.encode(cuerpo)); }
  catch { return null; }
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo)));
    if (typeof p.sub !== 'string' || (p.rol !== 'paciente' && p.rol !== 'nutricionista')) return null;
    if (typeof p.exp !== 'number' || p.exp <= ahoraS) return null;
    return { id: p.sub, rol: p.rol as Rol };
  } catch { return null; }
}

export class NoAutenticado extends Error { status = 401 }

/** Actor de la petición o error 401. Úsalo al inicio de cada ruta protegida. */
export async function actorDe(req: Request, secreto: string): Promise<Actor> {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer (\S+)$/.exec(h);
  const a = m ? await verificarSesion(m[1], secreto) : null;
  if (!a) throw new NoAutenticado('sesión inválida o vencida');
  return a;
}
