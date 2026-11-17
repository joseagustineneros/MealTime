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
  it('rotación: kid nuevo con caché vigente recarga las claves (máx. 1 vez por minuto)', async () => {
    let llamadas = 0;
    const viejas = { ...jwk, kid: 'vieja' };
    let lista: JsonWebKey[] = [viejas];
    const f = (async () => { llamadas++; return new Response(JSON.stringify({ keys: lista }),
      { headers: { 'cache-control': 'max-age=3600' } }); }) as typeof fetch;
    const t = await token({});
    // Caché cargada con la clave vieja; recién traída, no se fuerza la recarga.
    expect(await verificarIdTokenGoogle(t, CLIENT, { fetchFn: f, ahoraS: AHORA })).toBeNull();
    expect(llamadas).toBe(1);
    // Google rota a k1. Pasado un minuto, el kid desconocido fuerza una recarga.
    lista = [jwk];
    expect(await verificarIdTokenGoogle(t, CLIENT, { fetchFn: f, ahoraS: AHORA + 61 }))
      .toEqual({ sub: 'g-123', email: 'p@x.cl', nombre: 'Prueba' });
    expect(llamadas).toBe(2);
    // Un kid inventado no vuelve a pedir claves dentro del mismo minuto.
    expect(await verificarIdTokenGoogle(await token({}, { alg: 'RS256', kid: 'inventada' }), CLIENT,
      { fetchFn: f, ahoraS: AHORA + 62 })).toBeNull();
    expect(llamadas).toBe(2);
  });
  it('firma con base64 inválido → null, no excepción', async () => {
    const [c, p] = (await token({})).split('.');
    expect(await verificar(`${c}.${p}.@@@`)).toBeNull();
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
  it('el rol solo se fija en el alta; otro rol → 409, alta sin rol → 400', async () => {
    const db = d1Falsa();
    const ident = { sub: 's1', email: 'a@x.cl', nombre: 'A' };
    const a = await usuarioDesdeGoogle(db, ident, 'nutricionista');
    expect(a.rol).toBe('nutricionista');
    expect(await usuarioDesdeGoogle(db, { ...ident, nombre: 'A2' })).toEqual(a);
    expect(await usuarioDesdeGoogle(db, ident, 'nutricionista')).toEqual(a);
    await expect(usuarioDesdeGoogle(db, ident, 'paciente')).rejects.toMatchObject({ status: 409, codigo: 'rol_distinto' });
    await expect(usuarioDesdeGoogle(db, { ...ident, sub: 's2' })).rejects.toMatchObject({ status: 400, codigo: 'rol_requerido' });
  });
  it('token sin nombre no borra el nombre guardado', async () => {
    const db = d1Falsa();
    const a = await usuarioDesdeGoogle(db, { sub: 's1', email: 'a@x.cl', nombre: 'Ana' }, 'paciente');
    await usuarioDesdeGoogle(db, { sub: 's1', email: 'nuevo@x.cl', nombre: '' });
    const u = await db.prepare('SELECT email, nombre FROM users WHERE id = ?').bind(a.id).first<{ email: string; nombre: string }>();
    expect(u).toEqual({ email: 'nuevo@x.cl', nombre: 'Ana' });
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
  it('rol: reingreso sin rol, rol distinto 409, alta sin rol 400, rol inválido 400', async () => {
    const env = { DB: d1Falsa(), SESSION_SECRET: 's', GOOGLE_CLIENT_ID: CLIENT };
    const ahora = Math.floor(Date.now() / 1000);
    const vigente = (extra: Record<string, unknown> = {}) => token({ iat: ahora - 10, exp: ahora + 3600, ...extra });
    expect((await loginGoogle({ idToken: await vigente() }, env, fetchFalso)).data)
      .toMatchObject({ error: 'rol_requerido' });
    const alta = await loginGoogle({ idToken: await vigente(), rol: 'nutricionista' }, env, fetchFalso);
    expect(alta.status).toBe(200);
    const reingreso = await loginGoogle({ idToken: await vigente() }, env, fetchFalso);
    expect((reingreso.data as { user: { rol: string } }).user.rol).toBe('nutricionista');
    const otro = await loginGoogle({ idToken: await vigente(), rol: 'paciente' }, env, fetchFalso);
    expect(otro).toMatchObject({ status: 409, data: { error: 'rol_distinto' } });
    expect((await loginGoogle({ idToken: await vigente(), rol: 'admin' }, env, fetchFalso)).status).toBe(400);
  });
});
