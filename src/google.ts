// Verificación del idToken de Google (JWT RS256) con WebCrypto, sin dependencias.
// Núcleo de seguridad: cambios solo con aprobación de Claude.

export interface JwkGoogle { kid: string; kty: string; n: string; e: string; alg?: string }
/** Devuelve las claves públicas de Google; `forzar` ignora la caché (rotación de claves). */
export type ObtenerClaves = (forzar?: boolean) => Promise<JwkGoogle[]>;

export interface IdentidadGoogle { sub: string; email: string; nombre: string }

export class TokenGoogleInvalido extends Error { status = 401 }

const URL_CLAVES = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISORES = new Set(['accounts.google.com', 'https://accounts.google.com']);
const HOLGURA_S = 60; // desfase de reloj tolerado

let cache: { claves: JwkGoogle[]; venceMs: number } | null = null;

/** Claves de Google con caché en memoria según `Cache-Control: max-age`. */
export const clavesGoogle: ObtenerClaves = async (forzar = false) => {
  const ahora = Date.now();
  if (!forzar && cache && cache.venceMs > ahora) return cache.claves;
  const r = await fetch(URL_CLAVES);
  if (!r.ok) throw new Error(`no se pudieron obtener las claves de Google (${r.status})`);
  const { keys } = (await r.json()) as { keys: JwkGoogle[] };
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '');
  cache = { claves: keys, venceMs: ahora + (m ? Number(m[1]) : 3600) * 1000 };
  return keys;
};

const desdeB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jsonB64url = (s: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(desdeB64url(s)));

function invalido(motivo: string): never {
  throw new TokenGoogleInvalido(`idToken de Google inválido: ${motivo}`);
}

export async function verificarIdToken(
  idToken: string,
  clientId: string,
  obtener: ObtenerClaves = clavesGoogle,
  ahoraS = Math.floor(Date.now() / 1000),
): Promise<IdentidadGoogle> {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID no configurado');
  if (typeof idToken !== 'string') invalido('formato');
  const partes = idToken.split('.');
  if (partes.length !== 3) invalido('formato');
  const [h, p, f] = partes;

  let cab: Record<string, unknown>, carga: Record<string, unknown>, firma: Uint8Array;
  try { cab = jsonB64url(h); carga = jsonB64url(p); firma = desdeB64url(f); }
  catch { invalido('formato'); }

  if (cab.alg !== 'RS256' || typeof cab.kid !== 'string') invalido('algoritmo');
  let jwk = (await obtener()).find(k => k.kid === cab.kid);
  if (!jwk) jwk = (await obtener(true)).find(k => k.kid === cab.kid);
  if (!jwk || jwk.kty !== 'RSA') invalido('clave desconocida');

  const clave = await crypto.subtle.importKey(
    'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, firma, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) invalido('firma');

  if (typeof carga.iss !== 'string' || !EMISORES.has(carga.iss)) invalido('emisor');
  const aud = Array.isArray(carga.aud) ? carga.aud : [carga.aud];
  if (!aud.includes(clientId)) invalido('audiencia');
  if (typeof carga.exp !== 'number' || carga.exp + HOLGURA_S <= ahoraS) invalido('vencido');
  if (typeof carga.iat === 'number' && carga.iat - HOLGURA_S > ahoraS) invalido('emitido en el futuro');
  if (typeof carga.sub !== 'string' || !carga.sub) invalido('sujeto');
  if (typeof carga.email !== 'string' || !carga.email) invalido('correo');
  if (carga.email_verified !== true && carga.email_verified !== 'true') invalido('correo no verificado');

  return { sub: carga.sub, email: carga.email, nombre: typeof carga.name === 'string' ? carga.name : '' };
}
