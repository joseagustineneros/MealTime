import { describe, it, expect, beforeEach } from 'vitest';
import { d1DePrueba } from './d1';
import { ingresarOCrear, postAuthGoogle, getMe } from '../src/cuentas';
import { autorizarSobrePaciente, contextoPaciente, contextoVinculo } from '../src/datos';
import { verificarSesion } from '../src/auth';
import { manejar } from '../src/http';
import { TokenGoogleInvalido } from '../src/google';
import type { Env } from '../src/index';
import type { SqlSync } from './d1';
import { CLIENTE, cargaGoogle, emisorFalso } from './google-falso';

let db: D1Database, sql: SqlSync;
beforeEach(() => ({ db, sql } = d1DePrueba()));

const ident = (sub = 'g-1', email = 'uno@ejemplo.cl', nombre = 'Uno Ficticio') => ({ sub, email, nombre });
const auditoria = () => sql.prepare('SELECT actor, accion, sujeto FROM audit_log ORDER BY id').all().map(r => ({ ...r }));

describe('ingresarOCrear', () => {
  it('crea con rol, luego ingresa sin rol y actualiza correo', async () => {
    const u = await ingresarOCrear(db, ident(), 'paciente');
    expect(u).toMatchObject({ email: 'uno@ejemplo.cl', rol: 'paciente' });
    const otra = await ingresarOCrear(db, ident('g-1', 'nuevo@ejemplo.cl'));
    expect(otra).toEqual({ ...u, email: 'nuevo@ejemplo.cl' });
    expect(auditoria()).toEqual([{ actor: u.id, accion: 'cuenta.crear', sujeto: u.id }]);
  });

  it('cuenta nueva sin rol → 400; rol inválido → 400; rol distinto → 409', async () => {
    await expect(ingresarOCrear(db, ident())).rejects.toMatchObject({ status: 400, codigo: 'rol_requerido' });
    await expect(ingresarOCrear(db, ident(), 'admin')).rejects.toMatchObject({ status: 400, codigo: 'rol_invalido' });
    await ingresarOCrear(db, ident(), 'nutricionista');
    await expect(ingresarOCrear(db, ident(), 'paciente')).rejects.toMatchObject({ status: 409, codigo: 'rol_distinto' });
  });
});

describe('POST /auth/google y GET /me', () => {
  const env = () => ({ DB: db, SESSION_SECRET: 's', GOOGLE_CLIENT_ID: 'c', CONSENTIMIENTO_VIGENTE: 'v1' }) as Env;
  // Las claves de Google se prueban en google.test.ts; aquí basta un idToken que no verifica.
  const req = (body: unknown) => new Request('https://x/auth/google', { method: 'POST', body: JSON.stringify(body) });

  it('errores de entrada con el formato {error, message}', async () => {
    const sinToken = await manejar(() => postAuthGoogle(req({}), env()));
    expect(sinToken.status).toBe(400);
    expect(await sinToken.json()).toMatchObject({ error: 'id_token_requerido' });

    const malo = await manejar(() => postAuthGoogle(req({ idToken: 'a.b.c' }), env(), async () => []));
    expect(malo.status).toBe(401);
    expect(await malo.json()).toMatchObject({ error: 'no_autenticado' });

    const noJson = await manejar(() => postAuthGoogle(new Request('https://x', { method: 'POST', body: '{' }), env()));
    expect(await noJson.json()).toMatchObject({ error: 'json_invalido' });
  });

  it('flujo completo: alta con idToken firmado, reingreso, sesión válida y /me', async () => {
    const g = await emisorFalso();
    const ahora = Math.floor(Date.now() / 1000);
    const e = { ...env(), GOOGLE_CLIENT_ID: CLIENTE };
    const idToken = await g.firmar(cargaGoogle(ahora));

    const r = await manejar(() => postAuthGoogle(req({ idToken, rol: 'paciente' }), e, g.obtener));
    expect(r.status).toBe(200);
    const { token: t, user: u } = await r.json() as { token: string; user: { id: string; rol: string } };
    expect(u).toMatchObject({ email: 'ficticio@ejemplo.cl', nombre: 'Persona Ficticia', rol: 'paciente' });
    expect(await verificarSesion(t, 's')).toEqual({ id: u.id, rol: 'paciente' });

    const otra = await manejar(() => postAuthGoogle(req({ idToken }), e, g.obtener));
    expect(((await otra.json()) as { user: { id: string } }).user.id).toBe(u.id);
    const comoNutri = await manejar(() => postAuthGoogle(req({ idToken, rol: 'nutricionista' }), e, g.obtener));
    expect(comoNutri.status).toBe(409);

    const me = await manejar(() => getMe(new Request('https://x/me', { headers: { authorization: `Bearer ${t}` } }), env()));
    expect(await me.json()).toEqual(u);
    const sin = await manejar(() => getMe(new Request('https://x/me'), env()));
    expect(sin.status).toBe(401);
    sql.exec('DELETE FROM users');
    expect((await manejar(() => getMe(new Request('https://x/me', { headers: { authorization: `Bearer ${t}` } }), env()))).status).toBe(401);
  });

  it('TokenGoogleInvalido se mapea a 401', async () => {
    const r = await manejar(async () => { throw new TokenGoogleInvalido('x'); });
    expect(r.status).toBe(401);
  });
});

describe('contextoPaciente y autorizarSobrePaciente', () => {
  const nut = { id: 'n1', rol: 'nutricionista' as const };
  const pac = { id: 'p1', rol: 'paciente' as const };

  beforeEach(() => {
    sql.exec(`
      INSERT INTO users (id, google_sub, email, rol) VALUES
        ('n1','gn1','n1@ejemplo.cl','nutricionista'), ('n2','gn2','n2@ejemplo.cl','nutricionista'),
        ('p1','gp1','p1@ejemplo.cl','paciente'), ('p2','gp2','p2@ejemplo.cl','paciente');
      INSERT INTO links (id, nutricionista, paciente, estado, consentimiento_v, consentido_en) VALUES
        ('l1','n1','p1','active','v1','2026-01-01'),
        ('l2','n1','p2','revoked','v1','2026-01-01');`);
  });

  it('vínculo activo, revocado y ajeno', async () => {
    expect(await contextoPaciente(db, nut, 'p1')).toEqual({ pacienteId: 'p1', vinculoActivo: true });
    expect(await contextoPaciente(db, nut, 'p2')).toEqual({ pacienteId: 'p2', vinculoActivo: false });
    expect(await contextoPaciente(db, { id: 'n2', rol: 'nutricionista' }, 'p1')).toEqual({ pacienteId: 'p1', vinculoActivo: false });
    expect(await contextoPaciente(db, pac, 'p1')).toEqual({ pacienteId: 'p1', vinculoActivo: false });
  });

  it('nutricionista: permite con vínculo activo y audita; deniega y audita el intento', async () => {
    await autorizarSobrePaciente(db, nut, 'logs.leer', 'p1');
    await expect(autorizarSobrePaciente(db, nut, 'plan.leer', 'p2')).rejects.toMatchObject({ status: 403 });
    await expect(autorizarSobrePaciente(db, nut, 'logs.escribir', 'p1')).rejects.toMatchObject({ status: 403 });
    await expect(autorizarSobrePaciente(db, nut, 'plan.leer', 'no-existe')).rejects.toMatchObject({ status: 403 });
    expect(auditoria()).toEqual([
      { actor: 'n1', accion: 'logs.leer', sujeto: 'p1' },
      { actor: 'n1', accion: 'denegado:plan.leer', sujeto: 'p2' },
      { actor: 'n1', accion: 'denegado:logs.escribir', sujeto: 'p1' },
      { actor: 'n1', accion: 'denegado:plan.leer', sujeto: 'no-existe' },
    ]);
  });

  it('revocar quita el acceso al instante', async () => {
    await autorizarSobrePaciente(db, nut, 'notas.leer', 'p1');
    sql.exec("UPDATE links SET estado='revoked' WHERE id='l1'");
    await expect(autorizarSobrePaciente(db, nut, 'notas.leer', 'p1')).rejects.toMatchObject({ status: 403 });
  });

  it('paciente: solo lo propio y sin auditoría', async () => {
    await autorizarSobrePaciente(db, pac, 'logs.escribir', 'p1');
    await expect(autorizarSobrePaciente(db, pac, 'logs.leer', 'p2')).rejects.toMatchObject({ status: 403 });
    expect(auditoria()).toEqual([]);
  });

  it('contextoVinculo', async () => {
    const r = await contextoVinculo(db, 'l1');
    expect(r?.vinculo).toMatchObject({ estado: 'active', paciente: 'p1' });
    expect(r?.ctx).toEqual({ vinculoDe: { nutricionista: 'n1', paciente: 'p1' } });
    expect(await contextoVinculo(db, 'nada')).toBeNull();
  });
});
