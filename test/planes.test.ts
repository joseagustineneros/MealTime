import { describe, it, expect, beforeEach } from 'vitest';
import worker, { type Env } from '../src/index';
import { firmarSesion } from '../src/auth';
import { usuarioDesdeGoogle } from '../src/datos';
import { d1Falsa } from './d1falsa';

let env: Env;
const tok: Record<string, string> = {};
const ids: Record<string, string> = {};

const plan = (nombre = 'Plan ficticio') => ({
  version: 1, nombre, horaFinal: '20:00', intervaloIdealMin: 180, intervaloMinimoMin: 150,
  comidas: [
    { id: 'desayuno', nombre: 'Desayuno', resumen: 'A', horaRef: '08:00' },
    { id: 'almuerzo', nombre: 'Almuerzo', resumen: 'B', horaRef: '14:00' },
    { id: 'cena', nombre: 'Cena', resumen: 'C', horaRef: '20:00', fija: true },
  ],
});

const pedir = async (quien: string, metodo: string, ruta: string, body?: unknown) => {
  const r = await worker.fetch(new Request(`https://api.test${ruta}`, {
    method: metodo, headers: { authorization: `Bearer ${tok[quien]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { status: r.status, data: await r.json() as any };
};

beforeEach(async () => {
  env = { DB: d1Falsa(), SESSION_SECRET: 's', CONSENTIMIENTO_VIGENTE: 'v1', GOOGLE_CLIENT_ID: 'x' };
  for (const [n, rol] of [['nutri', 'nutricionista'], ['ajeno', 'nutricionista'], ['pac', 'paciente'], ['pac2', 'paciente']] as const) {
    const a = await usuarioDesdeGoogle(env.DB, { sub: n, email: `${n}@x.cl`, nombre: n }, rol);
    ids[n] = a.id; tok[n] = await firmarSesion(a, 's');
  }
  const { data } = await pedir('nutri', 'POST', '/invites');
  expect((await pedir('pac', 'POST', '/links/accept', { code: data.code, consentVersion: 'v1' })).status).toBe(201);
});

describe('planes', () => {
  it('el paciente fija y reemplaza su plan propio', async () => {
    expect((await pedir('pac', 'GET', '/plans/active')).data.plan).toBeNull();
    expect((await pedir('pac', 'PUT', '/plans/active', { plan: plan('Uno') })).status).toBe(201);
    expect((await pedir('pac', 'PUT', '/plans/active', { plan: plan('Dos') })).status).toBe(201);
    expect((await pedir('pac', 'GET', '/plans/active')).data.plan.plan.nombre).toBe('Dos');
    const bad = await pedir('pac', 'PUT', '/plans/active', { plan: { version: 1 } });
    expect(bad.status).toBe(400);
  });

  it('propuesta del nutricionista: solo con vínculo y el paciente decide', async () => {
    expect((await pedir('ajeno', 'POST', `/patients/${ids.pac}/plans`, { plan: plan() })).status).toBe(403);
    expect((await pedir('pac2', 'POST', `/patients/${ids.pac}/plans`, { plan: plan() })).status).toBe(403);
    const prop = await pedir('nutri', 'POST', `/patients/${ids.pac}/plans`, { plan: plan('Propuesto') });
    expect(prop.status).toBe(201);
    const pend = await pedir('pac', 'GET', '/plans/pending');
    expect(pend.data.planes[0]).toMatchObject({ id: prop.data.id, autorNombre: 'nutri' });
    // Nadie más decide por el paciente.
    expect((await pedir('nutri', 'POST', `/plans/${prop.data.id}/accept`)).status).toBe(403);
    expect((await pedir('pac2', 'POST', `/plans/${prop.data.id}/accept`)).status).toBe(403);
    expect((await pedir('pac', 'POST', `/plans/${prop.data.id}/accept`)).data.estado).toBe('active');
    expect((await pedir('pac', 'POST', `/plans/${prop.data.id}/reject`)).status).toBe(409);
    expect((await pedir('nutri', 'GET', `/patients/${ids.pac}/plan`)).data.plan.plan.nombre).toBe('Propuesto');
    expect((await pedir('ajeno', 'GET', `/patients/${ids.pac}/plan`)).status).toBe(403);
  });

  it('rechazar no toca el plan activo', async () => {
    await pedir('pac', 'PUT', '/plans/active', { plan: plan('Mío') });
    const prop = await pedir('nutri', 'POST', `/patients/${ids.pac}/plans`, { plan: plan('Otro') });
    expect((await pedir('pac', 'POST', `/plans/${prop.data.id}/reject`)).data.estado).toBe('rejected');
    expect((await pedir('pac', 'GET', '/plans/active')).data.plan.plan.nombre).toBe('Mío');
  });
});

describe('registros y pacientes', () => {
  const reg = (fecha: string, comidaId: string, planificada: string, hecha: string | null) =>
    ({ fecha, comidaId, planificada, hecha, opcional: false });

  it('upsert idempotente y validación', async () => {
    const lote = { registros: [reg('2026-11-17', 'desayuno', '08:00', null)] };
    expect((await pedir('pac', 'POST', '/logs', lote)).data.guardados).toBe(1);
    lote.registros[0].hecha = '08:10';
    await pedir('pac', 'POST', '/logs', lote);
    const r = await pedir('nutri', 'GET', `/patients/${ids.pac}/logs?from=2026-11-17&to=2026-11-17`);
    expect(r.data.registros).toEqual([expect.objectContaining({ comidaId: 'desayuno', hecha: '08:10', opcional: false })]);
    expect((await pedir('pac', 'POST', '/logs', { registros: [reg('2026-13-01', 'x', '08:00', null)] })).status).toBe(400);
    expect((await pedir('pac', 'POST', '/logs', { registros: [] })).status).toBe(400);
    expect((await pedir('nutri', 'POST', '/logs', lote)).status).toBe(403);
  });

  it('el nutricionista ve cumplimiento solo de sus pacientes vinculados', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    await pedir('pac', 'POST', '/logs', { registros: [
      reg(hoy, 'desayuno', '08:00', '08:05'), reg(hoy, 'almuerzo', '14:00', null), reg(hoy, 'cena', '20:00', '20:20'),
    ] });
    const lista = await pedir('nutri', 'GET', '/patients');
    expect(lista.data.pacientes).toHaveLength(1);
    expect(lista.data.pacientes[0]).toMatchObject({ nombre: 'pac', cumplimiento7d: { porcentaje: 67, masOmitida: 'almuerzo' } });
    expect((await pedir('ajeno', 'GET', '/patients')).data.pacientes).toEqual([]);
    expect((await pedir('pac', 'GET', '/patients')).status).toBe(403);
    expect((await pedir('ajeno', 'GET', `/patients/${ids.pac}/logs`)).status).toBe(403);
    expect((await pedir('nutri', 'GET', `/patients/${ids.pac}/logs?from=2026-01-01&to=2026-12-31`)).status).toBe(400);
  });

  it('revocar corta el acceso de inmediato', async () => {
    const v = (await pedir('pac', 'GET', '/links')).data.vinculos[0];
    expect((await pedir('nutri', 'GET', `/patients/${ids.pac}/plan`)).status).toBe(200);
    await pedir('pac', 'DELETE', `/links/${v.id}`);
    expect((await pedir('nutri', 'GET', `/patients/${ids.pac}/plan`)).status).toBe(403);
    expect((await pedir('nutri', 'GET', '/patients')).data.pacientes).toEqual([]);
  });
});
