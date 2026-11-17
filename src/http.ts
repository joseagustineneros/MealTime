// Utilidades HTTP compartidas por las rutas.
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export class ErrorHttp extends Error {
  constructor(public status: number, public codigo: string, message: string) { super(message); }
}

export const malaPeticion = (m: string) => new ErrorHttp(400, 'datos_invalidos', m);
export const noEncontrado = (m = 'No encontrado') => new ErrorHttp(404, 'no_encontrado', m);
export const conflicto = (m: string) => new ErrorHttp(409, 'conflicto', m);

/** Convierte errores conocidos (ErrorHttp, NoAutenticado, Prohibido) en respuestas JSON. */
export function respuestaDeError(e: unknown): Response {
  if (e instanceof ErrorHttp) return json({ error: e.codigo, message: e.message }, e.status);
  const s = (e as { status?: number })?.status;
  if (s === 401) return json({ error: 'no_autenticado', message: 'Sesión inválida o vencida' }, 401);
  if (s === 403) return json({ error: 'prohibido', message: 'No autorizado' }, 403);
  console.error(e);
  return json({ error: 'interno', message: 'Error interno' }, 500);
}

export async function leerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* cae al error */ }
  throw malaPeticion('El cuerpo debe ser un objeto JSON');
}
