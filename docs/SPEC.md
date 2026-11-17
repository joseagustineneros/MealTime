# MealTime (OnTime Cloud) — Especificación v0.1

Backend y panel para vincular pacientes (app Android OnTime) con nutricionistas.
Infraestructura: Cloudflare Workers + D1. Sin dependencias pesadas.

## Principios
1. **El paciente no paga nunca** y la app funciona sin cuenta ni servidor.
2. **Sin vínculo, nada sale del teléfono.** El servidor solo guarda datos de pacientes vinculados.
3. **Consentimiento expreso y revocable.** El vínculo se acepta con el texto de consentimiento versionado; revocar corta el acceso de inmediato.
4. **Datos mínimos.** Se guardan planes (JSON), vínculos y marcas de comida. Nunca PDFs ni fotos.
5. **El paciente aprueba todo cambio de plan.** El nutricionista propone; el paciente acepta o rechaza.

## Roles
| Rol | Dónde | Puede |
|---|---|---|
| Paciente | App Android | Gestionar su plan, registrar comidas, vincular/desvincular, aceptar planes propuestos |
| Nutricionista | Panel web | Generar invitaciones, ver plan y registros de pacientes con vínculo activo, proponer planes, notas privadas |

Un usuario tiene un solo rol (MVP).

## Formato del plan (JSON, `version: 1`)
```json
{
  "version": 1,
  "nombre": "Plan hipocalórico 2000 kcal",
  "horaFinal": "20:00",
  "intervaloIdealMin": 180,
  "intervaloMinimoMin": 150,
  "comidas": [
    {"id": "desayuno", "nombre": "Desayuno", "resumen": "Pan integral + 2 huevos", "horaRef": "08:00", "omitible": false},
    {"id": "col_am", "nombre": "Colación mañana", "resumen": "Yogurt proteico + 30 g nueces", "horaRef": "11:00", "omitible": true, "prioridadOmitir": 1},
    {"id": "cena", "nombre": "Cena", "resumen": "200 g proteína + ensalada", "horaRef": "20:00", "omitible": false, "fija": true},
    {"id": "nocturna", "nombre": "Colación nocturna", "resumen": "Quesillo + infusión", "horaRef": "22:00", "omitible": true, "opcional": true}
  ]
}
```
Reglas: 1–8 comidas; `id` único `[a-z0-9_]{1,24}`; horas `HH:mm`; exactamente una comida `fija` (la última no opcional), que define `horaFinal`; comidas `opcional` van después de la fija; `prioridadOmitir` menor = se omite primero.

## Modelo de datos
Ver `schema.sql`. Tablas: `users`, `invites`, `links`, `plans`, `meal_logs`, `notes`, `audit_log`.

## Permisos (fuente de verdad: `src/authz.ts`)
- Paciente: solo sus propios planes, registros y vínculos.
- Nutricionista: lee plan activo y registros de un paciente **solo con vínculo `active`**; propone planes (`pending`) a esos pacientes; notas solo propias y nunca visibles al paciente.
- Revocar un vínculo (cualquiera de las partes) quita el acceso al instante. Los registros siguen siendo del paciente.
- Toda lectura de datos de un paciente por un nutricionista queda en `audit_log`.

## API (JSON, `Authorization: Bearer <sesión>`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /auth/google` | — | `{idToken, rol?}` → `{token, user}` (sesión firmada, 30 días). `rol` es obligatorio solo al crear la cuenta; otro rol distinto del registrado → 409 `rol_distinto` |
| `GET /me` | ambos | Usuario actual |
| `POST /invites` | nutri | → `{code, expiresAt}` (8 caracteres, 72 h, un uso) |
| `POST /links/accept` | paciente | `{code, consentVersion}` → vínculo `active` |
| `GET /links` | ambos | Vínculos propios |
| `DELETE /links/:id` | ambos | Revoca |
| `GET /patients` | nutri | Pacientes con vínculo activo + cumplimiento 7 días |
| `GET /patients/:id/plan` | nutri | Plan activo del paciente |
| `GET /patients/:id/logs?from&to` | nutri | Registros (máx. 92 días) |
| `POST /patients/:id/plans` | nutri | Propone plan → `pending` |
| `GET/POST /patients/:id/notes` | nutri | Notas privadas |
| `GET /plans/active` · `PUT /plans/active` | paciente | Plan propio |
| `GET /plans/pending` | paciente | Planes propuestos |
| `POST /plans/:id/accept` · `/reject` | paciente | Decide plan propuesto |
| `POST /logs` | paciente | Lote de marcas (upsert por `fecha+comidaId`) |
| `POST /parse` | ambos | PDF/imagen → plan (etapa 3, limitado) |

Errores: `{error: "<codigo>", message}` con 400/401/403/404/409/429.

## Cumplimiento
Una comida cuenta **a tiempo** si `done_at` está a ±30 min de `planned_time`. Cumplimiento = a tiempo / planificadas no opcionales, por ventana (7 días por defecto).

## Sincronización (app)
Cola local de marcas; envío en lote al recuperar conexión; el servidor es idempotente por `(patient_id, fecha, comida_id)`. La app consulta `GET /plans/pending` al abrirse.

## Etapas
1. Plan genérico en la app (repo OnTime) + importación manual.
2. Cuentas, vínculos, sync de marcas, panel de solo lectura. ← **este repo arranca aquí**
3. Propuesta de planes desde el panel + `/parse` con IA.
4. Notas, métricas, plan pagado para nutricionistas con muchos pacientes.
