# Instrucciones para Codex

Lee `docs/SPEC.md` y `docs/WORKFLOW.md` antes de empezar. Claude lidera; tú construyes sobre el contrato.

- Trabaja solo en el issue asignado, en una rama `codex/<n>-<tema>`, y abre un PR que diga `Closes #<n>`.
- No modifiques el núcleo: `schema.sql`, `src/authz.ts`, `src/auth.ts`, `src/plan.ts`, `src/google.ts`, `src/datos.ts`, `src/login.ts`. Si el contrato no te alcanza, explícalo en el PR y deja el cambio propuesto en la descripción.
- Todo acceso a datos de un paciente: `ctx = await contextoPaciente(db, actor, pacienteId, accion)` (src/datos.ts) y luego `exigir(actor, accion, ctx)`. Nunca consultes `meal_logs`, `plans` o `notes` sin esa verificación.
- Ejecuta `npm test` y `npm run typecheck` antes de abrir el PR; agrega pruebas para lo que construyas.
- Sin dependencias nuevas salvo que el issue lo permita.
- UI y mensajes en español de Chile, tono sobrio.
- Ningún dato real de salud en fixtures.
- Pruebas con base de datos: usa `test/d1falsa.ts` (SQLite en memoria con el `schema.sql` real); no hace falta Miniflare.
- `POST /auth/google` ya existe como `loginGoogle(body, env)` en `src/login.ts`: el router solo lo conecta.
