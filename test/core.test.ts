import { describe, it, expect } from 'vitest';
import { puede, exigir, type Actor } from '../src/authz';
import { validarPlan, type Plan } from '../src/plan';
import { cumplimiento, aTiempo } from '../src/adherence';

const pac: Actor = { id: 'p1', rol: 'paciente' };
const otroPac: Actor = { id: 'p2', rol: 'paciente' };
const nut: Actor = { id: 'n1', rol: 'nutricionista' };

describe('authz', () => {
  it('paciente accede solo a lo propio', () => {
    expect(puede(pac, 'logs.leer', { pacienteId: 'p1' })).toBe(true);
    expect(puede(otroPac, 'logs.leer', { pacienteId: 'p1' })).toBe(false);
    expect(puede(pac, 'logs.escribir', { pacienteId: 'p1' })).toBe(true);
    expect(puede(pac, 'plan.decidir', { pacienteId: 'p2' })).toBe(false);
  });
  it('nutricionista requiere vínculo activo', () => {
    expect(puede(nut, 'logs.leer', { pacienteId: 'p1', vinculoActivo: true })).toBe(true);
    expect(puede(nut, 'logs.leer', { pacienteId: 'p1', vinculoActivo: false })).toBe(false);
    expect(puede(nut, 'logs.leer', { pacienteId: 'p1' })).toBe(false);
    expect(puede(nut, 'plan.proponer', { pacienteId: 'p1', vinculoActivo: true })).toBe(true);
  });
  it('nutricionista nunca escribe registros ni decide planes del paciente', () => {
    const ctx = { pacienteId: 'p1', vinculoActivo: true };
    expect(puede(nut, 'logs.escribir', ctx)).toBe(false);
    expect(puede(nut, 'plan.decidir', ctx)).toBe(false);
    expect(puede(nut, 'plan.editarPropio', ctx)).toBe(false);
  });
  it('las notas son privadas del nutricionista', () => {
    expect(puede(pac, 'notas.leer', { pacienteId: 'p1' })).toBe(false);
    expect(puede(nut, 'notas.leer', { pacienteId: 'p1', vinculoActivo: true })).toBe(true);
  });
  it('cualquiera de las partes revoca, terceros no', () => {
    const vinculoDe = { nutricionista: 'n1', paciente: 'p1' };
    expect(puede(pac, 'vinculo.revocar', { vinculoDe })).toBe(true);
    expect(puede(nut, 'vinculo.revocar', { vinculoDe })).toBe(true);
    expect(puede(otroPac, 'vinculo.revocar', { vinculoDe })).toBe(false);
  });
  it('roles en invitaciones', () => {
    expect(puede(nut, 'invitacion.crear')).toBe(true);
    expect(puede(pac, 'invitacion.crear')).toBe(false);
    expect(puede(pac, 'vinculo.aceptar')).toBe(true);
    expect(puede(nut, 'vinculo.aceptar')).toBe(false);
  });
  it('exigir lanza 403', () => {
    expect(() => exigir(otroPac, 'logs.leer', { pacienteId: 'p1' })).toThrow(/no autorizado/);
  });
});

const planOk: Plan = {
  version: 1, nombre: 'Plan de prueba', horaFinal: '20:00',
  intervaloIdealMin: 180, intervaloMinimoMin: 150,
  comidas: [
    { id: 'desayuno', nombre: 'Desayuno', resumen: 'A', horaRef: '08:00' },
    { id: 'col_am', nombre: 'Colación', resumen: 'B', horaRef: '11:00', omitible: true, prioridadOmitir: 1 },
    { id: 'cena', nombre: 'Cena', resumen: 'C', horaRef: '20:00', fija: true },
    { id: 'nocturna', nombre: 'Nocturna', resumen: 'D', horaRef: '22:00', opcional: true },
  ],
};

describe('plan', () => {
  it('acepta un plan válido', () => expect(validarPlan(planOk)).toEqual([]));
  it('exige una comida fija que coincida con horaFinal', () => {
    const p = structuredClone(planOk); p.comidas[2].fija = false;
    expect(validarPlan(p)).toContain('falta la comida fija');
    const q = structuredClone(planOk); q.horaFinal = '19:00';
    expect(validarPlan(q)).toContain('la comida fija debe coincidir con horaFinal');
  });
  it('rechaza ids repetidos, horas inválidas y desorden', () => {
    const p = structuredClone(planOk);
    p.comidas[1].id = 'desayuno'; p.comidas[1].horaRef = '7:00';
    const e = validarPlan(p);
    expect(e).toContain('comidas[1].id repetido');
    expect(e).toContain('comidas[1].horaRef debe ser HH:mm');
    const q = structuredClone(planOk); q.comidas[1].horaRef = '07:00';
    expect(validarPlan(q)).toContain('las horas de referencia deben ir en orden creciente');
  });
  it('opcionales solo después de la fija', () => {
    const p = structuredClone(planOk); p.comidas[1].opcional = true;
    expect(validarPlan(p)).toContain('comidas[1] opcional debe ir después de la fija');
  });
  it('rechaza basura', () => {
    expect(validarPlan(null)).toEqual(['el plan debe ser un objeto']);
    expect(validarPlan({ version: 2 })).toContain('version debe ser 1');
  });
});

describe('cumplimiento', () => {
  const r = (comidaId: string, planificada: string, hecha: string | null, opcional = false) =>
    ({ fecha: '2026-11-17', comidaId, planificada, hecha, opcional });
  it('tolerancia de ±30 min', () => {
    expect(aTiempo(r('a', '08:00', '08:30'))).toBe(true);
    expect(aTiempo(r('a', '08:00', '08:31'))).toBe(false);
    expect(aTiempo(r('a', '08:00', '07:30'))).toBe(true);
    expect(aTiempo(r('a', '08:00', null))).toBe(false);
  });
  it('excluye opcionales y detecta la más omitida', () => {
    const c = cumplimiento([
      r('desayuno', '08:00', '08:10'), r('col_pm', '17:00', null), r('cena', '20:00', '21:00'),
      r('col_pm', '17:00', null), r('nocturna', '22:00', null, true),
    ]);
    expect(c).toEqual({ planificadas: 4, aTiempo: 1, hechas: 2, porcentaje: 25, masOmitida: 'col_pm' });
  });
  it('sin datos devuelve porcentaje nulo', () => {
    expect(cumplimiento([]).porcentaje).toBeNull();
  });
});
