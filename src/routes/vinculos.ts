// Invitaciones y vínculos (issue #1).
import type { Actor } from '../authz';
import { exigir } from '../authz';
import { conflicto, json, leerJson, malaPeticion, noEncontrado } from '../http';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VIGENCIA_H = 72;

export function codigoInvitacion(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, x => ALFABETO[x % ALFABETO.length]).join(''); // 256 % 32 = 0: sin sesgo
}

const ahoraIso = (d = new Date()) => d.toISOString();

export async function crearInvitacion(db: D1Database, actor: Actor, ahora = new Date()) {
  exigir(actor, 'invitacion.crear');
  const code = codigoInvitacion();
  const expira = ahoraIso(new Date(ahora.getTime() + VIGENCIA_H * 3600_000));
  await db.prepare('INSERT INTO invites (code, nutricionista, expira) VALUES (?, ?, ?)')
    .bind(code, actor.id, expira).run();
  return json({ code, expiresAt: expira }, 201);
}

export async function aceptarInvitacion(
  db: D1Database, actor: Actor, req: Request, consentimientoVigente: string, ahora = new Date(),
) {
  exigir(actor, 'vinculo.aceptar');
  const b = await leerJson(req);
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  if (!/^[A-Z2-9]{8}$/.test(code)) throw malaPeticion('Código inválido');
  if (b.consentVersion !== consentimientoVigente) throw malaPeticion('Debes aceptar el consentimiento vigente');

  const inv = await db.prepare('SELECT nutricionista, expira, usado_por FROM invites WHERE code = ?')
    .bind(code).first<{ nutricionista: string; expira: string; usado_por: string | null }>();
  if (!inv || inv.usado_por || inv.expira <= ahoraIso(ahora)) throw noEncontrado('Código inexistente, vencido o ya usado');

  const activo = await db.prepare(
    "SELECT id FROM links WHERE nutricionista = ? AND paciente = ? AND estado = 'active'",
  ).bind(inv.nutricionista, actor.id).first();
  if (activo) throw conflicto('Ya estás vinculado con este nutricionista');

  const id = crypto.randomUUID();
  const en = ahoraIso(ahora);
  // Marca el código como usado solo si sigue libre (evita doble uso concurrente).
  const uso = await db.prepare('UPDATE invites SET usado_por = ?, usado_en = ? WHERE code = ? AND usado_por IS NULL')
    .bind(actor.id, en, code).run();
  if ((uso as { meta?: { changes?: number } }).meta?.changes === 0) throw noEncontrado('Código ya usado');
  await db.prepare(
    "INSERT INTO links (id, nutricionista, paciente, estado, consentimiento_v, consentido_en) VALUES (?, ?, ?, 'active', ?, ?)",
  ).bind(id, inv.nutricionista, actor.id, consentimientoVigente, en).run();
  await db.prepare('INSERT INTO audit_log (actor, accion, sujeto) VALUES (?, ?, ?)')
    .bind(actor.id, 'vinculo.aceptar', id).run();
  return json({ id, nutricionista: inv.nutricionista, estado: 'active', consentidoEn: en }, 201);
}

export async function listarVinculos(db: D1Database, actor: Actor) {
  const col = actor.rol === 'paciente' ? 'paciente' : 'nutricionista';
  const { results } = await db.prepare(
    `SELECT l.id, l.estado, l.consentido_en AS consentidoEn, l.revocado_en AS revocadoEn,
            u.id AS otroId, u.nombre AS otroNombre
       FROM links l JOIN users u ON u.id = ${col === 'paciente' ? 'l.nutricionista' : 'l.paciente'}
      WHERE l.${col} = ? ORDER BY l.consentido_en DESC`,
  ).bind(actor.id).all();
  return json({ vinculos: results });
}

export async function revocarVinculo(db: D1Database, actor: Actor, id: string, ahora = new Date()) {
  const l = await db.prepare('SELECT nutricionista, paciente, estado FROM links WHERE id = ?')
    .bind(id).first<{ nutricionista: string; paciente: string; estado: string }>();
  if (!l) throw noEncontrado('Vínculo inexistente');
  exigir(actor, 'vinculo.revocar', { vinculoDe: l });
  if (l.estado !== 'active') return json({ id, estado: l.estado });
  await db.prepare("UPDATE links SET estado = 'revoked', revocado_en = ?, revocado_por = ? WHERE id = ?")
    .bind(ahoraIso(ahora), actor.id, id).run();
  await db.prepare('INSERT INTO audit_log (actor, accion, sujeto) VALUES (?, ?, ?)')
    .bind(actor.id, 'vinculo.revocar', id).run();
  return json({ id, estado: 'revoked' });
}
