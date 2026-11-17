# Flujo de trabajo: Claude (líder) + Codex en paralelo

## Principio: contrato primero
Claude fija el contrato (SPEC.md, `schema.sql`, tipos en `src/plan.ts`, reglas en `src/authz.ts`).
Con el contrato estable, Codex y Claude trabajan en paralelo sin pisarse.

## Carriles
| Carril | Quién | Qué | Archivos |
|---|---|---|---|
| Crítico | Claude | Esquema, permisos, auth, cumplimiento, revisión de PRs | `schema.sql`, `src/authz.ts`, `src/auth.ts`, `src/adherence.ts`, `docs/` |
| Construcción | Codex | Endpoints sobre el contrato, panel web, cliente Android | `src/routes/*`, `panel/*`, repo OnTime |
| Detalles | Qwen (local) | Textos, datos de prueba, ajustes menores | `fixtures/*`, textos |

## Ciclo (loop)
1. **Claude** convierte el siguiente bloque del BACKLOG en issues con etiqueta `codex` y criterio de aceptación verificable.
2. **Codex** toma cada issue (comentario `@codex` en el issue), trabaja en rama `codex/<n>-<tema>` y abre PR que cierra el issue.
3. **Claude** revisa el PR: contrato, permisos, pruebas. Pide cambios con comentario o hace merge (squash).
4. Mientras Codex construye, **Claude** avanza el carril crítico del siguiente bloque.
5. Cada ciclo actualiza `docs/BACKLOG.md` (hecho / en curso / siguiente).

Cadencia: una revisión cada ~3 h mientras haya trabajo abierto. El loop se pausa cuando:
- falta una decisión del dueño (textos legales, precios, nombre), o
- no hay PRs ni issues abiertos que avanzar.

## Reglas
- Nadie hace push directo a `main`; todo entra por PR.
- Un PR = un issue; cambios chicos y revisables.
- `npm test` y `npm run typecheck` deben pasar.
- Cambios a `src/authz.ts`, `src/auth.ts` o `schema.sql` solo con aprobación de Claude (son el núcleo de seguridad).
- Ningún dato real de salud en fixtures ni en pruebas.
