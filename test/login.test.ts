import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { verificarIdTokenGoogle, _limpiarCache } from '../src/google';
import { usuarioDesdeGoogle, contextoPaciente } from '../src/datos';
import { loginGoogle } from '../src/login';
import { verificarSesion } from '../src/auth';
import { d1Falsa } from './d1falsa';

const CLIENT = 'cliente.apps.googleusercontent.com';
const AHORA = 1_800_000_000;
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let par: CryptoKeyPair, jwk: JsonWebKey, fetchFalso: typeof fetch;
beforeAll(async () => {
  par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' } as unknown as JsonWebKey;
  fetchFalso = (async () => new Response(JSON.stringify({ keys: [jwk] }),
    { headers: { 'cache-control': 'max-age=60' } })) as typeof fetch;
});
beforeEach(() => _limpiarCache());

async function token(payload: Record<string, unknown>, cab: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) {
  const base = { iss: 'https://accounts.google.com', aud: CLIENT, sub: 'g-123', email: 'p@x.cl',
    email_verified: true, name: 'Prueba', iat: AHORA - 10, exp: AHORA + 3600, ...payload };
  const datos = `${b64url(JSON.stringify(cab))}.${b64url(JSON.stringify(base))}`;
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(datos));
  return `${datos}.${b64url(firma)}`;
}
const verificar = (t: string) => verificarIdTokenGoogle(t, CLIENT, { fetchFn: fetchFalso, ahoraS: AHORA });

describe('idToken de Google', () => {
  it('acepta un token válido', async () => {
    expect(await verificar(await token({}))).toEqual({ sub: 'g-123', email: 'p@x.cl', nombre: 'Prueba' });
  });
  it('rechaza audiencia, emisor, vencido, email sin verificar, alg y kid', async () => {
    expect(await verificar(await token({ aud: 'otro' }))).toBeNull();
    expect(await verificar(await token({ iss: 'malo.com' }))).toBeNull();
    expect(await verificar(await token({ exp: AHORA - 1 }))).toBeNull();
    expect(await verificar(await token({ email_verified: false }))).toBeNull();
    expect(await verificar(await token({}, { alg: 'HS256', kid: 'k1' }))).toBeNull();
    expect(await verificar(await token({}, { alg: 'RS256', kid: 'otra' }))).toBeNull();
  });
  it('rechaza firma alterada y basura', async () => {
    const t = await token({});
    const [c, , f] = t.split('.');
    expect(await verificar(`${c}.${b64url(JSON.stringify({ sub: 'intruso', aud: CLIENT }))}.${f}`)).toBeNull();
    expect(await verificar('no.es.jwt')).toBeNull();
    expect(await verificar('x')).toBeNull();
  });
});

describe('usuarios y contexto', () => {
  it('el rol solo se fija en el alta', async () => {
    const db = d1Falsa();
    const ident = { sub: 's1', email: 'a@x.cl', nombre: 'A' };
    const a = await usuarioDesdeGoogle(db, ident, 'nutricionista');
    const b = await usuarioDesdeGoogle(db, { ...ident, nombre: 'A2' }, 'paciente');
    expect(b).toEqual(a);
    expect(a.rol).toBe('nutricionista');
  });
  it('vínculo activo habilita y audita; revocado no', async () => {
    const db = d1Falsa();
    const n = await usuarioDesdeGoogle(db, { sub: 'n', email: 'n@x.cl', nombre: 'N' }, 'nutricionista');
    const p = await usuarioDesdeGoogle(db, { sub: 'p', email: 'p@x.cl', nombre: 'P' }, 'paciente');
    expect(await contextoPaciente(db, n, p.id, 'logs.leer')).toEqual({ pacienteId: p.id, vinculoActivo: false });
    await db.prepare("INSERT INTO links (id, nutricionista, paciente, estado, consentimiento_v, consentido_en) VALUES ('l1', ?, ?, 'active', 'v1', datetime('now'))")
      .bind(n.id, p.id).run();
    expect(await contextoPaciente(db, n, p.id, 'logs.leer')).toEqual({ pacienteId: p.id, vinculoActivo: true });
    const audit = await db.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE actor = ?').bind(n.id).first<{ c: number }>();
    expect(audit?.c).toBe(1);
    await db.prepare("UPDATE links SET estado = 'revoked' WHERE id = 'l1'").run();
    expect((await contextoPaciente(db, n, p.id, 'logs.leer')).vinculoActivo).toBe(false);
  });
});

describe('POST /auth/google', () => {
  it('emite sesión válida y rechaza token malo', async () => {
    const env = { DB: d1Falsa(), SESSION_SECRET: 's', GOOGLE_CLIENT_ID: CLIENT };
    // El manejador usa la hora real: firmamos un token vigente ahora.
    const ahora = Math.floor(Date.now() / 1000);
    const t = await token({ iat: ahora - 10, exp: ahora + 3600 });
    const r = await loginGoogle({ idToken: t, rol: 'paciente' }, env, fetchFalso);
    expect(r.status).toBe(200);
    const d = r.data as { token: string; user: { rol: string } };
    expect(d.user.rol).toBe('paciente');
    expect(await verificarSesion(d.token, 's')).toEqual(d.user);
    expect((await loginGoogle({ idToken: 'x' }, env, fetchFalso)).status).toBe(401);
    expect((await loginGoogle({}, env, fetchFalso)).status).toBe(400);
  });
});
