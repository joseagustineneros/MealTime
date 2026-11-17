# Backlog

## Hecho (ciclo 1 — Claude)
- SPEC v0.1, WORKFLOW, AGENTS.md
- `schema.sql`, `src/authz.ts`, `src/plan.ts`, `src/adherence.ts`, `src/auth.ts` (sesiones) con pruebas

## Ciclo 2 — en paralelo
| # | Quién | Tarea |
|---|---|---|
| C1 | Claude | Verificación de idToken de Google (`POST /auth/google`) y alta de usuario con rol |
| C2 | Claude | Capa de datos de vínculos: `contextoPaciente(db, actor, pacienteId)` → `Contexto` + registro en `audit_log` |
| X1 | Codex | Router y rutas de invitaciones y vínculos sobre `actorDe` + `exigir` |
| X2 | Codex | Panel web del nutricionista (estático, modo demo con datos ficticios) |
| X3 | Codex (repo OnTime) | App: reemplazar el plan fijo por un Plan v1 en JSON (plan actual como predeterminado) |

## Siguiente (ciclo 3)
- Rutas de planes (activo, pendiente, aceptar/rechazar, proponer) y `POST /logs`
- `GET /patients` con cumplimiento 7 días
- App: vincular con código/QR, cola de sincronización, planes propuestos
- Textos de consentimiento v1 y términos (requiere decisión del dueño)

## Decisiones pendientes del dueño
- Texto de consentimiento y términos de uso (responsable / encargado del tratamiento)
- Cuenta de Cloudflare para crear la base D1 y publicar el Worker
- ID de cliente OAuth de Google
