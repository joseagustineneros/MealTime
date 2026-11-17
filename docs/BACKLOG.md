# Backlog

## Hecho (ciclo 1 — Claude)
- SPEC v0.1, WORKFLOW, AGENTS.md
- `schema.sql`, `src/authz.ts`, `src/plan.ts`, `src/adherence.ts`, `src/auth.ts` (sesiones) con pruebas

## Ciclo 2 — en paralelo
| # | Quién | Tarea | Estado |
|---|---|---|---|
| C1 | Claude | Verificación de idToken de Google (`POST /auth/google`, `GET /me`) y alta de usuario con rol | Hecho: `src/google.ts`, `src/cuentas.ts` |
| C2 | Claude | Capa de datos de vínculos: `contextoPaciente` / `autorizarSobrePaciente` / `contextoVinculo` + `audit_log` | Hecho: `src/datos.ts` |
| X1 | Codex | Router y rutas de invitaciones y vínculos sobre `actorDe` + `exigir` | Issue #1 abierto |
| X2 | Codex | Panel web del nutricionista (estático, modo demo con datos ficticios) | Issue #2 abierto |
| X3 | Codex (repo OnTime) | App: reemplazar el plan fijo por un Plan v1 en JSON (plan actual como predeterminado) | Issue OnTime#2 abierto |

Extras del ciclo 2 para todas las rutas: `src/http.ts` (`json`, `ErrorApi`, `manejar`, `cuerpoJson`) y
`test/d1.ts` (D1 de prueba sobre `node:sqlite` con `schema.sql`, sin dependencias).

## Siguiente (ciclo 3)
- Rutas de planes (activo, pendiente, aceptar/rechazar, proponer) y `POST /logs`
- `GET /patients` con cumplimiento 7 días
- App: vincular con código/QR, cola de sincronización, planes propuestos
- Textos de consentimiento v1 y términos (requiere decisión del dueño)

## Decisiones pendientes del dueño
- Texto de consentimiento y términos de uso (responsable / encargado del tratamiento)
- Cuenta de Cloudflare para crear la base D1 y publicar el Worker
- ID de cliente OAuth de Google
