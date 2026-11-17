// Registros de comidas (paciente) y vista del nutricionista con cumplimiento.
import type { Actor } from '../authz';
import { exigir } from '../authz';
import { contextoPaciente } from '../datos';
import { json, leerJson, malaPeticion } from '../http';
import { cumplimiento, type Registro } from '../adherence';

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z0-9_]{1,24}$/;
const MAX_LOTE = 200;
const MAX_DIAS = 92;

const diaIso = (d: Date) => d.toISOString().slice(0, 10);
const restarDias = (fecha: string, n: number) => diaIso(new Date(Date.parse(`${fecha}T00:00:00Z`) - n * 86400_000));

/** POST /logs: upsert idempotente por (paciente, fecha, comida). */
export async function guardarRegistros(db: D1Database, actor: Actor, req: Request) {
  exigir(actor, 'logs.escribir', { pacienteId: actor.id });
  const b = await leerJson(req);
  const lote = b.registros;
  if (!Array.isArray(lote) || lote.length === 0 || lote.length > MAX_LOTE) throw malaPeticion(`registros debe tener entre 1 y ${MAX_LOTE} elementos`);
  const stmts = lote.map((r, i) => {
    const x = r as Record<string, unknown>;
    const ok = typeof x.fecha === 'string' && FECHA.test(x.fecha)
      && typeof x.comidaId === 'string' && ID.test(x.comidaId)
      && typeof x.planificada === 'string' && HHMM.test(x.planificada)
      && (x.hecha === null || (typeof x.hecha === 'string' && HHMM.test(x.hecha)))
      && (x.opcional === undefined || typeof x.opcional === 'boolean');
    if (!ok) throw malaPeticion(`registros[${i}] inválido`);
    return db.prepare(
      `INSERT INTO meal_logs (paciente, fecha, comida_id, planificada, hecha, opcional, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (paciente, fecha, comida_id) DO UPDATE SET
         planificada = excluded.planificada, hecha = excluded.hecha,
         opcional = excluded.opcional, actualizado = excluded.actualizado`,
    ).bind(actor.id, x.fecha, x.comidaId, x.planificada, x.hecha, x.opcional ? 1 : 0);
  });
  await db.batch(stmts);
  return json({ guardados: stmts.length });
}

async function leerRegistros(db: D1Database, pacienteId: string, desde: string, hasta: string): Promise<Registro[]> {
  const { results } = await db.prepare(
    `SELECT fecha, comida_id AS comidaId, planificada, hecha, opcional FROM meal_logs
      WHERE paciente = ? AND fecha BETWEEN ? AND ? ORDER BY fecha, planificada`,
  ).bind(pacienteId, desde, hasta).all<Omit<Registro, 'opcional'> & { opcional: number }>();
  return results.map(r => ({ ...r, opcional: !!r.opcional }));
}

/** GET /patients/:id/logs?from&to (nutricionista con vínculo). */
export async function registrosPaciente(db: D1Database, actor: Actor, pacienteId: string, url: URL, hoy = diaIso(new Date())) {
  exigir(actor, 'logs.leer', await contextoPaciente(db, actor, pacienteId, 'logs.leer'));
  const hasta = url.searchParams.get('to') ?? hoy;
  const desde = url.searchParams.get('from') ?? restarDias(hasta, 6);
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) throw malaPeticion('Rango de fechas inválido');
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400_000 >= MAX_DIAS) throw malaPeticion(`Máximo ${MAX_DIAS} días`);
  const registros = await leerRegistros(db, pacienteId, desde, hasta);
  return json({ desde, hasta, registros, cumplimiento: cumplimiento(registros) });
}

/** GET /patients: pacientes con vínculo activo y cumplimiento de los últimos 7 días. */
export async function listarPacientes(db: D1Database, actor: Actor, hoy = diaIso(new Date())) {
  exigir(actor, 'invitacion.crear'); // solo nutricionistas
  const { results } = await db.prepare(
    `SELECT u.id, u.nombre, l.consentido_en AS desde FROM links l JOIN users u ON u.id = l.paciente
      WHERE l.nutricionista = ? AND l.estado = 'active' ORDER BY u.nombre`,
  ).bind(actor.id).all<{ id: string; nombre: string; desde: string }>();
  const desde = restarDias(hoy, 6);
  const pacientes = [];
  for (const p of results) {
    exigir(actor, 'logs.leer', await contextoPaciente(db, actor, p.id, 'pacientes.listar'));
    const regs = await leerRegistros(db, p.id, desde, hoy);
    const ultima = regs.filter(r => r.hecha).map(r => `${r.fecha} ${r.hecha}`).sort().pop() ?? null;
    pacientes.push({ ...p, cumplimiento7d: cumplimiento(regs), ultimaMarca: ultima });
  }
  pacientes.sort((a, b) => (a.cumplimiento7d.porcentaje ?? -1) - (b.cumplimiento7d.porcentaje ?? -1));
  return json({ pacientes });
}
