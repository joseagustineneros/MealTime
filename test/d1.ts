// D1 de prueba sobre node:sqlite (Node ≥ 22.5) en memoria con schema.sql aplicado.
// Implementa solo lo que usa el código (prepare/bind/first/all/run).
// Se carga con process.getBuiltinModule porque Vite no resuelve 'node:sqlite' y así
// evitamos sumar @types/node (que choca con @cloudflare/workers-types).

type Valor = null | number | bigint | string | Uint8Array;
export interface SqlSync {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...p: Valor[]): Record<string, unknown> | undefined;
    all(...p: Valor[]): Record<string, unknown>[];
    run(...p: Valor[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
}
declare const process: { getBuiltinModule(id: string): any };

export function d1DePrueba(): { db: D1Database; sql: SqlSync } {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const { readFileSync } = process.getBuiltinModule('node:fs');
  const sql: SqlSync = new DatabaseSync(':memory:');
  sql.exec(readFileSync('schema.sql', 'utf8'));
  const prepare = (q: string) => {
    let params: Valor[] = [];
    const st = {
      bind(...v: unknown[]) {
        params = v.map(x => {
          if (x === undefined) throw new Error('D1_TYPE_ERROR: undefined no permitido');
          return typeof x === 'boolean' ? Number(x) : (x as Valor);
        });
        return st;
      },
      async first<T>(col?: string) {
        const r = sql.prepare(q).get(...params);
        if (!r) return null;
        return (col ? r[col] : { ...r }) as T;
      },
      async all<T>() { return { results: sql.prepare(q).all(...params).map(r => ({ ...r })) as T[], success: true }; },
      async run() {
        const r = sql.prepare(q).run(...params);
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
    };
    return st;
  };
  return { db: { prepare } as unknown as D1Database, sql };
}
