import { describe, it, expect, beforeEach } from 'vitest';
import worker, { type Env } from '../src/index';
import { firmarSesion } from '../src/auth';
import { usuarioDesdeGoogle } from '../src/datos';
import { codigoInvitacion } from '../src/routes/vinculos';
import { d1Falsa } from './d1falsa';

let env: Env;
const tokens: Record<string, string> = {};

async function alta(nombre: string, rol: 'paciente' | 'nutricionista') {
  const a = await usuarioDesdeGoogle(env.DB, { sub: nombre, email: `${nombre}@x.cl`, nombre }, rol);
  tokens[nombre] = await firmarSesion(a, env.SESSION_SECRET);
  return a;
}
const pedir = (quien: string | null, metodo: string, ruta: string, body?: unknown) =>
  worker.fetch(new Request(`https://api.test${ruta}`, {
    method: metodo,
    headers: { ...(quien ? { authorization: `Bearer ${tokens[quien]}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);

beforeEach(async () => {
  env = { DB: d1Falsa(), SESSION_SECRET: 'secreto', CONSENTIMIENTO_VIGENTE: 'v1', GOOGLE_CLIENT_ID: 'x' };
  await alta('nutri', 'nutricionista');
  await alta('nutri2', 'nutricionista');
  await alta('pac', 'paciente');
  await alta('pac2', 'paciente');
});

async function invitar(quien = 'nutri') {
  const r = await pedir(quien, 'POST', '/invites');
  expect(r.status).toBe(201);
  return (await r.json() as { code: string }).code;
}

describe('invitaciones y vínculos', () => {
  it('código de 8 caracteres sin ambiguos', () => {
    for (let i = 0; i < 50; i++) expect(codigoInvitacion()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('flujo completo: invitar, aceptar, listar', async () => {
    const code = await invitar();
    const r = await pedir('pac', 'POST', '/links/accept', { code: code.toLowerCase(), consentVersion: 'v1' });
    expect(r.status).toBe(201);
    const lp = await (await pedir('pac', 'GET', '/links')).json() as { vinculos: { otroNombre: string; estado: string }[] };
    expect(lp.vinculos).toEqual([expect.objectContaining({ otroNombre: 'nutri', estado: 'active' })]);
    const ln = await (await pedir('nutri', 'GET', '/links')).json() as { vinculos: { otroNombre: string }[] };
    expect(ln.vinculos[0].otroNombre).toBe('pac');
  });

  it('solo nutricionistas invitan y solo pacientes aceptan', async () => {
    expect((await pedir('pac', 'POST', '/invites')).status).toBe(403);
    const code = await invitar();
    expect((await pedir('nutri2', 'POST', '/links/accept', { code, consentVersion: 'v1' })).status).toBe(403);
  });

  it('consentimiento equivocado, código vencido y reutilizado', async () => {
    const code = await invitar();
    expect((await pedir('pac', 'POST', '/links/accept', { code, consentVersion: 'v0' })).status).toBe(400);
    await env.DB.prepare("UPDATE invites SET expira = '2000-01-01T00:00:00.000Z' WHERE code = ?").bind(code).run();
    expect((await pedir('pac', 'POST', '/links/accept', { code, consentVersion: 'v1' })).status).toBe(404);
    const code2 = await invitar();
    expect((await pedir('pac', 'POST', '/links/accept', { code: code2, consentVersion: 'v1' })).status).toBe(201);
    expect((await pedir('pac2', 'POST', '/links/accept', { code: code2, consentVersion: 'v1' })).status).toBe(404);
  });

  it('vínculo duplicado con el mismo nutricionista: 409', async () => {
    await pedir('pac', 'POST', '/links/accept', { code: await invitar(), consentVersion: 'v1' });
    expect((await pedir('pac', 'POST', '/links/accept', { code: await invitar(), consentVersion: 'v1' })).status).toBe(409);
  });

  it('revocan las partes; un tercero recibe 403', async () => {
    const r = await pedir('pac', 'POST', '/links/accept', { code: await invitar(), consentVersion: 'v1' });
    const { id } = await r.json() as { id: string };
    expect((await pedir('nutri2', 'DELETE', `/links/${id}`)).status).toBe(403);
    expect((await pedir('pac2', 'DELETE', `/links/${id}`)).status).toBe(403);
    const d = await pedir('nutri', 'DELETE', `/links/${id}`);
    expect(await d.json()).toEqual({ id, estado: 'revoked' });
    // Revocado por el nutricionista: el paciente puede volver a vincularse con un código nuevo.
    expect((await pedir('pac', 'POST', '/links/accept', { code: await invitar(), consentVersion: 'v1' })).status).toBe(201);
    const r2 = await pedir('pac', 'POST', '/links/accept', { code: await invitar('nutri2'), consentVersion: 'v1' });
    const { id: id2 } = await r2.json() as { id: string };
    expect((await pedir('pac', 'DELETE', `/links/${id2}`)).status).toBe(200);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE accion = 'vinculo.revocar'").first<{ c: number }>();
    expect(audit?.c).toBe(2);
  });

  it('errores de autenticación y rutas', async () => {
    expect((await pedir(null, 'GET', '/links')).status).toBe(401);
    expect((await pedir('pac', 'DELETE', '/links/no-existe')).status).toBe(404);
    expect((await pedir('pac', 'GET', '/nada')).status).toBe(404);
    const malo = await worker.fetch(new Request('https://api.test/links/accept', {
      method: 'POST', headers: { authorization: `Bearer ${tokens.pac}` }, body: 'no json' }), env);
    expect(malo.status).toBe(400);
  });
});
