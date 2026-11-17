// Contrato del plan v1 (ver docs/SPEC.md). Núcleo: cambios solo con aprobación de Claude.

export interface Comida {
  id: string;
  nombre: string;
  resumen: string;
  horaRef: string;            // HH:mm
  omitible?: boolean;
  prioridadOmitir?: number;   // menor = se omite primero
  fija?: boolean;             // la comida que cierra el día (horaFinal)
  opcional?: boolean;         // va después de la fija
}

export interface Plan {
  version: 1;
  nombre: string;
  horaFinal: string;
  intervaloIdealMin: number;
  intervaloMinimoMin: number;
  comidas: Comida[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z0-9_]{1,24}$/;
export const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Devuelve la lista de errores (vacía si el plan es válido). */
export function validarPlan(p: unknown): string[] {
  const e: string[] = [];
  if (typeof p !== 'object' || p === null) return ['el plan debe ser un objeto'];
  const x = p as Partial<Plan>;
  if (x.version !== 1) e.push('version debe ser 1');
  if (typeof x.nombre !== 'string' || !x.nombre.trim() || x.nombre.length > 80) e.push('nombre inválido');
  if (typeof x.horaFinal !== 'string' || !HHMM.test(x.horaFinal)) e.push('horaFinal debe ser HH:mm');
  for (const k of ['intervaloIdealMin', 'intervaloMinimoMin'] as const) {
    const v = x[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 60 || v > 360) e.push(`${k} debe estar entre 60 y 360`);
  }
  if (typeof x.intervaloIdealMin === 'number' && typeof x.intervaloMinimoMin === 'number'
      && x.intervaloMinimoMin > x.intervaloIdealMin) e.push('intervaloMinimoMin no puede superar intervaloIdealMin');
  if (!Array.isArray(x.comidas) || x.comidas.length < 1 || x.comidas.length > 8) {
    e.push('debe haber entre 1 y 8 comidas');
    return e;
  }
  const ids = new Set<string>();
  let fijaIdx = -1;
  x.comidas.forEach((c, i) => {
    const n = `comidas[${i}]`;
    if (!c || typeof c !== 'object') { e.push(`${n} inválida`); return; }
    if (typeof c.id !== 'string' || !ID.test(c.id)) e.push(`${n}.id inválido`);
    else if (ids.has(c.id)) e.push(`${n}.id repetido`); else ids.add(c.id);
    if (typeof c.nombre !== 'string' || !c.nombre.trim() || c.nombre.length > 40) e.push(`${n}.nombre inválido`);
    if (typeof c.resumen !== 'string' || c.resumen.length > 200) e.push(`${n}.resumen inválido`);
    if (typeof c.horaRef !== 'string' || !HHMM.test(c.horaRef)) e.push(`${n}.horaRef debe ser HH:mm`);
    if (c.fija) { if (fijaIdx >= 0) e.push('solo puede haber una comida fija'); fijaIdx = i; }
    if (c.fija && c.opcional) e.push(`${n} no puede ser fija y opcional`);
  });
  if (fijaIdx < 0) e.push('falta la comida fija');
  else {
    const fija = x.comidas[fijaIdx];
    if (fija.horaRef !== x.horaFinal) e.push('la comida fija debe coincidir con horaFinal');
    x.comidas.forEach((c, i) => {
      if (i < fijaIdx && c.opcional) e.push(`comidas[${i}] opcional debe ir después de la fija`);
      if (i > fijaIdx && !c.opcional) e.push(`comidas[${i}] después de la fija debe ser opcional`);
    });
    const ord = x.comidas.slice(0, fijaIdx + 1).map(c => (HHMM.test(c.horaRef) ? aMin(c.horaRef) : NaN));
    if (ord.some((v, i) => i > 0 && !(v > ord[i - 1]))) e.push('las horas de referencia deben ir en orden creciente');
  }
  return e;
}
