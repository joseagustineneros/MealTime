// Utilidades HTTP compartidas por todas las rutas: respuestas JSON y mapeo de errores.

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Error con código para el cliente: responde `{error: codigo, message}` con `status`. */
export class ErrorApi extends Error {
  constructor(public status: number, public codigo: string, message: string) { super(message); }
}

const CODIGOS: Record<number, string> = {
  400: 'solicitud_invalida', 401: 'no_autenticado', 403: 'prohibido',
  404: 'no_encontrado', 409: 'conflicto', 429: 'demasiadas_solicitudes',
};

/** Convierte cualquier error en respuesta JSON; errores sin `status` → 500 sin detalles. */
export function respuestaDeError(e: unknown): Response {
  if (e instanceof ErrorApi) return json({ error: e.codigo, message: e.message }, e.status);
  const status = (e as { status?: unknown })?.status;
  if (typeof status === 'number' && CODIGOS[status]) {
    return json({ error: CODIGOS[status], message: (e as Error).message }, status);
  }
  console.error(e);
  return json({ error: 'error_interno', message: 'Error interno' }, 500);
}

export async function manejar(f: () => Promise<Response>): Promise<Response> {
  try { return await f(); } catch (e) { return respuestaDeError(e); }
}

/** Cuerpo JSON como objeto o 400. */
export async function cuerpoJson(req: Request): Promise<Record<string, unknown>> {
  let b: unknown;
  try { b = await req.json(); } catch { throw new ErrorApi(400, 'json_invalido', 'El cuerpo debe ser JSON válido'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ErrorApi(400, 'json_invalido', 'El cuerpo debe ser un objeto JSON');
  return b as Record<string, unknown>;
}
