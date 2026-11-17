// Planes: propio del paciente, propuestos por el nutricionista y su decisión.
import type { Actor } from '../authz';
import { exigir } from '../authz';
import { contextoPaciente } from '../datos';
import { conflicto, json, leerJson, malaPeticion, noEncontrado } from '../http';
import { validarPlan } from '../plan';

function planValido(b: Record<string, unknown>) {
  const plan = b.plan;
  const errores = validarPlan(plan);
  if (errores.length) throw malaPeticion(`Plan inválido: ${errores.join('; ')}`);
  return JSON.stringify(plan);
}

const fila = (p: { id: string; json: string; autor: string; estado: string; creado: string }) =>
  ({ id: p.id, estado: p.estado, autor: p.autor, creado: p.creado, plan: JSON.parse(p.json) });

export async function planActivo(db: D1Database, actor: Actor, pacienteId: string) {
  exigir(actor, 'plan.leer', await contextoPaciente(db, actor, pacienteId, 'plan.leer'));
  const p = await db.prepare("SELECT id, json, autor, estado, creado FROM plans WHERE paciente = ? AND estado = 'active'")
    .bind(pacienteId).first<{ id: string; json: string; autor: string; estado: string; creado: string }>();
  return json({ plan: p ? fila(p) : null });
}

export async function reemplazarPlanPropio(db: D1Database, actor: Actor, req: Request) {
  exigir(actor, 'plan.editarPropio', { pacienteId: actor.id });
  const texto = planValido(await leerJson(req));
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE plans SET estado = 'archived', decidido = datetime('now') WHERE paciente = ? AND estado = 'active'").bind(actor.id),
    db.prepare("INSERT INTO plans (id, paciente, autor, estado, json) VALUES (?, ?, ?, 'active', ?)").bind(id, actor.id, actor.id, texto),
  ]);
  return json({ id, estado: 'active' }, 201);
}

export async function proponerPlan(db: D1Database, actor: Actor, pacienteId: string, req: Request) {
  exigir(actor, 'plan.proponer', await contextoPaciente(db, actor, pacienteId, 'plan.proponer'));
  const texto = planValido(await leerJson(req));
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO plans (id, paciente, autor, estado, json) VALUES (?, ?, ?, 'pending', ?)")
    .bind(id, pacienteId, actor.id, texto).run();
  return json({ id, estado: 'pending' }, 201);
}

export async function planesPendientes(db: D1Database, actor: Actor) {
  exigir(actor, 'plan.decidir', { pacienteId: actor.id });
  const { results } = await db.prepare(
    `SELECT p.id, p.json, p.autor, p.estado, p.creado, u.nombre AS autorNombre
       FROM plans p JOIN users u ON u.id = p.autor
      WHERE p.paciente = ? AND p.estado = 'pending' ORDER BY p.creado DESC`,
  ).bind(actor.id).all<{ id: string; json: string; autor: string; estado: string; creado: string; autorNombre: string }>();
  return json({ planes: results.map(p => ({ ...fila(p), autorNombre: p.autorNombre })) });
}

export async function decidirPlan(db: D1Database, actor: Actor, planId: string, aceptar: boolean) {
  const p = await db.prepare('SELECT paciente, estado FROM plans WHERE id = ?')
    .bind(planId).first<{ paciente: string; estado: string }>();
  if (!p) throw noEncontrado('Plan inexistente');
  exigir(actor, 'plan.decidir', { pacienteId: p.paciente });
  if (p.estado !== 'pending') throw conflicto('El plan ya fue decidido');
  if (aceptar) {
    await db.batch([
      db.prepare("UPDATE plans SET estado = 'archived', decidido = datetime('now') WHERE paciente = ? AND estado = 'active'").bind(actor.id),
      db.prepare("UPDATE plans SET estado = 'active', decidido = datetime('now') WHERE id = ?").bind(planId),
    ]);
  } else {
    await db.prepare("UPDATE plans SET estado = 'rejected', decidido = datetime('now') WHERE id = ?").bind(planId).run();
  }
  return json({ id: planId, estado: aceptar ? 'active' : 'rejected' });
}
