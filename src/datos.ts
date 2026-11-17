// Capa de datos del núcleo: alta de usuarios y contexto de permisos. Núcleo de seguridad.
import type { Actor, Contexto, Rol } from './authz';
import type { IdentidadGoogle } from './google';
import { ErrorHttp } from './http';

/**
 * Busca o crea el usuario. Un usuario tiene un solo rol:
 * - cuenta nueva sin `rolAlta` → 400 `rol_requerido` (no se asume paciente);
 * - cuenta existente con otro `rolAlta` → 409 `rol_distinto`; sin `rolAlta`, ingresa con su rol.
 */
export async function usuarioDesdeGoogle(db: D1Database, id: IdentidadGoogle, rolAlta?: Rol): Promise<Actor> {
  const previo = await db.prepare('SELECT id, rol FROM users WHERE google_sub = ?')
    .bind(id.sub).first<{ id: string; rol: Rol }>();
  if (previo) {
    if (rolAlta !== undefined && rolAlta !== previo.rol) {
      throw new ErrorHttp(409, 'rol_distinto', `Esta cuenta ya está registrada como ${previo.rol}`);
    }
    // Si el token no trae nombre, se conserva el que había.
    await db.prepare("UPDATE users SET email = ?, nombre = COALESCE(NULLIF(?, ''), nombre) WHERE id = ?")
      .bind(id.email, id.nombre, previo.id).run();
    return { id: previo.id, rol: previo.rol };
  }
  if (rolAlta === undefined) {
    throw new ErrorHttp(400, 'rol_requerido', 'Cuenta nueva: indica el rol ("paciente" o "nutricionista")');
  }
  const nuevo = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, google_sub, email, nombre, rol) VALUES (?, ?, ?, ?, ?)')
    .bind(nuevo, id.sub, id.email, id.nombre, rolAlta).run();
  return { id: nuevo, rol: rolAlta };
}

/**
 * Contexto para `exigir(actor, accion, ctx)` sobre los datos de `pacienteId`.
 * Si un nutricionista con vínculo activo consulta, queda en audit_log.
 */
export async function contextoPaciente(
  db: D1Database, actor: Actor, pacienteId: string, accion: string,
): Promise<Contexto> {
  if (actor.rol === 'paciente') return { pacienteId };
  const v = await db.prepare(
    "SELECT 1 AS ok FROM links WHERE nutricionista = ? AND paciente = ? AND estado = 'active'",
  ).bind(actor.id, pacienteId).first<{ ok: number }>();
  const vinculoActivo = v?.ok === 1;
  if (vinculoActivo) {
    await db.prepare('INSERT INTO audit_log (actor, accion, sujeto) VALUES (?, ?, ?)')
      .bind(actor.id, accion, pacienteId).run();
  }
  return { pacienteId, vinculoActivo };
}
