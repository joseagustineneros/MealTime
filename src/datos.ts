// Capa de datos de permisos: obtiene los hechos que necesita authz.ts y deja rastro en audit_log.
// Núcleo de seguridad: cambios solo con aprobación de Claude.
import { puede, Prohibido, type Accion, type Actor, type Contexto } from './authz';

export async function registrarAuditoria(db: D1Database, actorId: string, accion: string, sujeto: string | null = null) {
  await db.prepare('INSERT INTO audit_log (actor, accion, sujeto) VALUES (?, ?, ?)')
    .bind(actorId, accion, sujeto === null ? null : sujeto.slice(0, 64)).run();
}

/** Hechos para decidir sobre datos de `pacienteId`. Solo consulta vínculos si el actor es nutricionista. */
export async function contextoPaciente(db: D1Database, actor: Actor, pacienteId: string): Promise<Contexto> {
  if (actor.rol !== 'nutricionista') return { pacienteId, vinculoActivo: false };
  const fila = await db.prepare(
    "SELECT 1 AS ok FROM links WHERE nutricionista = ? AND paciente = ? AND estado = 'active' LIMIT 1",
  ).bind(actor.id, pacienteId).first<{ ok: number }>();
  return { pacienteId, vinculoActivo: fila !== null };
}

/**
 * Punto de entrada obligatorio para toda ruta que toque datos de un paciente
 * (`meal_logs`, `plans`, `notes`). Exige el permiso y, si el actor es nutricionista,
 * registra el acceso (o el intento denegado) en `audit_log`. Lanza `Prohibido` (403).
 * Un paciente inexistente se trata igual que uno sin vínculo: 403, sin revelar si existe.
 */
export async function autorizarSobrePaciente(
  db: D1Database, actor: Actor, accion: Accion, pacienteId: string,
): Promise<Contexto> {
  const ctx = await contextoPaciente(db, actor, pacienteId);
  const ok = puede(actor, accion, ctx);
  if (actor.rol === 'nutricionista') {
    await registrarAuditoria(db, actor.id, ok ? accion : `denegado:${accion}`, pacienteId);
  }
  if (!ok) throw new Prohibido(`no autorizado: ${accion}`);
  return ctx;
}

export interface Vinculo {
  id: string; nutricionista: string; paciente: string; estado: 'active' | 'revoked';
}

/** Vínculo por id con su `Contexto` para `vinculo.revocar`, o `null` si no existe. */
export async function contextoVinculo(db: D1Database, linkId: string): Promise<{ vinculo: Vinculo; ctx: Contexto } | null> {
  const v = await db.prepare('SELECT id, nutricionista, paciente, estado FROM links WHERE id = ?')
    .bind(linkId).first<Vinculo>();
  if (!v) return null;
  return { vinculo: v, ctx: { vinculoDe: { nutricionista: v.nutricionista, paciente: v.paciente } } };
}
