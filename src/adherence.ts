// Cálculo de cumplimiento (ver docs/SPEC.md §Cumplimiento).
import { aMin } from './plan';

export interface Registro {
  fecha: string;          // YYYY-MM-DD
  comidaId: string;
  planificada: string;    // HH:mm
  hecha: string | null;   // HH:mm
  opcional: boolean;
}

export const TOLERANCIA_MIN = 30;

export function aTiempo(r: Registro, tolerancia = TOLERANCIA_MIN): boolean {
  if (!r.hecha) return false;
  return Math.abs(aMin(r.hecha) - aMin(r.planificada)) <= tolerancia;
}

export interface Cumplimiento {
  planificadas: number;   // no opcionales
  aTiempo: number;
  hechas: number;         // marcadas, a cualquier hora
  porcentaje: number | null;   // null si no hay comidas planificadas
  masOmitida: string | null;   // comidaId no opcional con más días sin marcar
}

export function cumplimiento(regs: Registro[], tolerancia = TOLERANCIA_MIN): Cumplimiento {
  const base = regs.filter(r => !r.opcional);
  const ok = base.filter(r => aTiempo(r, tolerancia)).length;
  const hechas = base.filter(r => r.hecha).length;
  const omisiones = new Map<string, number>();
  for (const r of base) if (!r.hecha) omisiones.set(r.comidaId, (omisiones.get(r.comidaId) ?? 0) + 1);
  let masOmitida: string | null = null, max = 0;
  for (const [id, n] of omisiones) if (n > max) { max = n; masOmitida = id; }
  return {
    planificadas: base.length,
    aTiempo: ok,
    hechas,
    porcentaje: base.length ? Math.round((ok / base.length) * 100) : null,
    masOmitida,
  };
}
