// Verificación del idToken de Google (RS256 contra las claves públicas de Google). Núcleo de seguridad.

export interface IdentidadGoogle { sub: string; email: string; nombre: string }

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];

const b64urlBytes = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

type Jwk = JsonWebKey & { kid?: string };
let cache: { claves: Jwk[]; hasta: number; traidas: number } | null = null;

// Recarga forzada como mucho una vez por minuto: un kid inventado no debe martillar a Google.
const RECARGA_MIN_MS = 60_000;

async function clavesGoogle(fetchFn: typeof fetch, ahoraMs: number, forzar = false): Promise<Jwk[]> {
  if (cache && cache.hasta > ahoraMs && !(forzar && ahoraMs - cache.traidas >= RECARGA_MIN_MS)) return cache.claves;
  const r = await fetchFn(CERTS);
  if (!r.ok) throw new Error('no se pudieron obtener las claves de Google');
  const { keys } = (await r.json()) as { keys: Jwk[] };
  const maxAge = /max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1];
  cache = { claves: keys, hasta: ahoraMs + (maxAge ? Number(maxAge) * 1000 : 3600_000), traidas: ahoraMs };
  return keys;
}

/** Solo para pruebas. */
export function _limpiarCache() { cache = null; }

/**
 * Devuelve la identidad si el token es válido para `clientId`; si no, null.
 * Rechaza: firma inválida, alg distinto de RS256, emisor, audiencia, vencido, email no verificado.
 */
export async function verificarIdTokenGoogle(
  idToken: string, clientId: string,
  opts: { fetchFn?: typeof fetch; ahoraS?: number } = {},
): Promise<IdentidadGoogle | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const ahoraS = opts.ahoraS ?? Math.floor(Date.now() / 1000);
  const partes = idToken.split('.');
  if (partes.length !== 3) return null;
  let cab: { alg?: string; kid?: string }, p: Record<string, unknown>, firma: Uint8Array;
  try { cab = b64urlJson(partes[0]); p = b64urlJson(partes[1]); firma = b64urlBytes(partes[2]); } catch { return null; }
  if (cab.alg !== 'RS256' || !cab.kid) return null;

  // kid desconocido: Google pudo rotar sus claves antes de que venza la caché; se recarga una vez.
  let jwk = (await clavesGoogle(fetchFn, ahoraS * 1000)).find(k => k.kid === cab.kid);
  if (!jwk) jwk = (await clavesGoogle(fetchFn, ahoraS * 1000, true)).find(k => k.kid === cab.kid);
  if (!jwk || jwk.kty !== 'RSA') return null;
  const clave = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, firma,
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  if (!ok) return null;

  if (!EMISORES.includes(p.iss as string)) return null;
  if (p.aud !== clientId) return null;
  if (typeof p.exp !== 'number' || p.exp <= ahoraS) return null;
  if (typeof p.iat === 'number' && p.iat > ahoraS + 300) return null;
  if (p.email_verified !== true || typeof p.email !== 'string' || typeof p.sub !== 'string') return null;
  return { sub: p.sub, email: p.email, nombre: typeof p.name === 'string' ? p.name : '' };
}
