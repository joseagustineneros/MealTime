// Reglas de permisos: única fuente de verdad. Núcleo de seguridad (solo cambios aprobados por Claude).

export type Rol = 'paciente' | 'nutricionista';
export interface Actor { id: string; rol: Rol }

export type Accion =
  | 'plan.leer' | 'plan.proponer' | 'plan.editarPropio' | 'plan.decidir'
  | 'logs.leer' | 'logs.escribir'
  | 'notas.leer' | 'notas.escribir'
  | 'vinculo.revocar' | 'invitacion.crear' | 'vinculo.aceptar';

/** Hechos necesarios para decidir; los obtiene la capa de datos. */
export interface Contexto {
  pacienteId?: string;        // dueño de los datos consultados
  vinculoActivo?: boolean;    // hay link 'active' entre actor (nutri) y pacienteId
  vinculoDe?: { nutricionista: string; paciente: string }; // para revocar
}

export function puede(actor: Actor, accion: Accion, ctx: Contexto = {}): boolean {
  const propio = ctx.pacienteId !== undefined && ctx.pacienteId === actor.id;
  const nutriVinculado = actor.rol === 'nutricionista' && ctx.vinculoActivo === true
    && ctx.pacienteId !== undefined;

  switch (accion) {
    case 'invitacion.crear':
      return actor.rol === 'nutricionista';
    case 'vinculo.aceptar':
      return actor.rol === 'paciente';
    case 'vinculo.revocar':
      return !!ctx.vinculoDe &&
        (ctx.vinculoDe.nutricionista === actor.id || ctx.vinculoDe.paciente === actor.id);
    case 'plan.editarPropio':
    case 'plan.decidir':
    case 'logs.escribir':
      return actor.rol === 'paciente' && propio;
    case 'plan.leer':
    case 'logs.leer':
      return (actor.rol === 'paciente' && propio) || nutriVinculado;
    case 'plan.proponer':
    case 'notas.leer':
    case 'notas.escribir':
      // Notas: privadas del nutricionista; el paciente nunca las ve.
      return nutriVinculado;
  }
}

/** Lanza 403 si no está permitido; usar en todas las rutas. */
export class Prohibido extends Error { status = 403 }
export function exigir(actor: Actor, accion: Accion, ctx: Contexto = {}): void {
  if (!puede(actor, accion, ctx)) throw new Prohibido(`no autorizado: ${accion}`);
}
