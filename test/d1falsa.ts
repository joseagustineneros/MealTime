// D1 mínima sobre node:sqlite con el schema.sql real (solo para pruebas del núcleo).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// vitest no resuelve 'node:sqlite' como import; se carga con require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export function d1Falsa(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(process.cwd(), 'schema.sql'), 'utf8'));
  const prep = (sql: string) => {
    let args: unknown[] = [];
    const st = {
      bind(...a: unknown[]) { args = a; return st; },
      async first<T>() { return (db.prepare(sql).get(...(args as never[])) ?? null) as T; },
      async all<T>() { return { results: db.prepare(sql).all(...(args as never[])) as T[], success: true }; },
      async run() { db.prepare(sql).run(...(args as never[])); return { success: true }; },
    };
    return st;
  };
  return { prepare: prep, exec: async (s: string) => db.exec(s) } as unknown as D1Database;
}
