// Punto de entrada del Worker. Las rutas se agregan en src/routes/* (issues de Codex).
export interface Env {
  DB: D1Database;
  CONSENTIMIENTO_VIGENTE: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req: Request, _env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/salud') return json({ ok: true });
    return json({ error: 'no_encontrado', message: 'Ruta no encontrada' }, 404);
  },
};
