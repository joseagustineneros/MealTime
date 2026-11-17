# Backlog

## Hecho (ciclo 1 — Claude)
- SPEC v0.1, WORKFLOW, AGENTS.md
- `schema.sql`, `src/authz.ts`, `src/plan.ts`, `src/adherence.ts`, `src/auth.ts` (sesiones) con pruebas

## Hecho (ciclo 2 — Claude)
- C1 verificación de idToken de Google + `loginGoogle` (alta con rol fijo)
- C2 `contextoPaciente` con auditoría + `test/d1falsa.ts` para pruebas con SQLite

- X1 router + invitaciones y vínculos (lo tomó Claude porque Codex no arrancó)

## Hecho (ciclo 3 — Claude)
- Planes: propio (GET/PUT /plans/active), propuestos (POST /patients/:id/plans), pendientes y decisión del paciente
- POST /logs idempotente; GET /patients con cumplimiento 7 días; GET /patients/:id/logs (máx. 92 días)

## Ciclo 2 — en paralelo
| # | Quién | Tarea |
|---|---|---|
| X2 | Codex | Panel web del nutricionista (estático, modo demo con datos ficticios) |
| X3 | Codex (repo OnTime) | App: reemplazar el plan fijo por un Plan v1 en JSON (plan actual como predeterminado) |

## Siguiente (ciclo 3)
- App: vincular con código/QR, cola de sincronización, planes propuestos
- Textos de consentimiento v1 y términos (requiere decisión del dueño)

## Bloqueos
- Codex: falta crear el entorno de MealTime y OnTime en chatgpt.com/codex (Settings → Environments). Mientras tanto X2 y X3 siguen pendientes.

## Decisiones pendientes del dueño
- Texto de consentimiento y términos de uso (responsable / encargado del tratamiento)
- Cuenta de Cloudflare para crear la base D1 y publicar el Worker
- ID de cliente OAuth de Google
