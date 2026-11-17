# Instrucciones para Codex

Lee `docs/SPEC.md` y `docs/WORKFLOW.md` antes de empezar. Claude lidera; tú construyes sobre el contrato.

- Trabaja solo en el issue asignado, en una rama `codex/<n>-<tema>`, y abre un PR que diga `Closes #<n>`.
- No modifiques `schema.sql`, `src/authz.ts`, `src/auth.ts` ni `src/plan.ts`. Si el contrato no te alcanza, explícalo en el PR y deja el cambio propuesto en la descripción.
- No modifiques tampoco `src/google.ts`, `src/cuentas.ts` ni `src/datos.ts` (núcleo).
- Todo acceso a datos de un paciente pasa por `autorizarSobrePaciente(db, actor, accion, pacienteId)` de `src/datos.ts` (usa `puede(...)` y registra en `audit_log`). Nunca consultes `meal_logs`, `plans` o `notes` sin esa verificación. Para revocar vínculos usa `contextoVinculo`.
- Respuestas y errores con `src/http.ts` (`json`, `ErrorApi`, `manejar`, `cuerpoJson`). Para pruebas con base de datos puedes usar `test/d1.ts` (SQLite en memoria con `schema.sql`).
- Ejecuta `npm test` y `npm run typecheck` antes de abrir el PR; agrega pruebas para lo que construyas.
- Sin dependencias nuevas salvo que el issue lo permita.
- UI y mensajes en español de Chile, tono sobrio.
- Ningún dato real de salud en fixtures.
