=== X1 | MealTime | Rutas de invitaciones y vínculos
@codex implementa este issue siguiendo AGENTS.md.

**Objetivo:** router en `src/index.ts` y rutas en `src/routes/vinculos.ts`:
`POST /invites`, `POST /links/accept`, `GET /links`, `DELETE /links/:id` (ver docs/SPEC.md).

**Requisitos**
- Autenticación con `actorDe(req, env.SESSION_SECRET)`; permisos con `exigir(...)` de `src/authz.ts`.
- Código de invitación: 8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` con `crypto.getRandomValues`, vence en 72 h, un solo uso.
- `POST /links/accept` exige `consentVersion === env.CONSENTIMIENTO_VIGENTE`; si ya hay vínculo activo con ese nutricionista responde 409.
- Revocar marca `estado='revoked'`, `revocado_en`, `revocado_por`; registra en `audit_log`.
- Errores `{error, message}` con 400/401/403/404/409; `NoAutenticado`→401, `Prohibido`→403.
- Pruebas con D1 real de Miniflare: se permite agregar `@cloudflare/vitest-pool-workers` (aplicar `schema.sql` en el setup).

**Aceptación:** `npm test` y `npm run typecheck` pasan; pruebas cubren: código vencido, código reutilizado, consentimiento equivocado, revocación por cada parte y por un tercero (403).

=== X2 | MealTime | Panel web del nutricionista (modo demo)
@codex implementa este issue siguiendo AGENTS.md.

**Objetivo:** `panel/` estático (HTML+CSS+JS sin framework ni dependencias) para el nutricionista.

**Pantallas**
1. Lista de pacientes: nombre, cumplimiento 7 días (%), comida más omitida, última marca. Orden por cumplimiento ascendente.
2. Ficha del paciente: tabla día × comida con hora planificada vs. real (verde a tiempo ±30 min, ámbar tarde, gris sin marca); notas privadas.
3. Botón "Invitar paciente": muestra código y QR (QR generado en el cliente, sin servicios externos).

**Requisitos**
- Capa `panel/api.js` con las rutas de docs/SPEC.md; `?demo=1` usa `panel/demo.json` con 4 pacientes ficticios (sin datos reales).
- Usa la lógica de `src/adherence.ts` (misma regla de ±30 min) o un port fiel con pruebas que comparen resultados.
- Español de Chile, sobrio, responsivo; accesible (contraste AA, navegación con teclado).

**Aceptación:** abre con `npx wrangler pages dev panel` o archivo local en modo demo; capturas de las 3 pantallas en el PR.

=== X3 | OnTime | App: plan configurable (Plan v1 en JSON)
@codex implementa este issue. Contrato del plan: https://github.com/joseagustineneros/MealTime/blob/main/docs/SPEC.md (sección "Formato del plan").

**Objetivo:** reemplazar el plan fijo (`Tipo`, `Menu`, nombres en `MealScheduler`) por un `Plan` v1 guardado en SharedPreferences como JSON.

**Requisitos**
- `MealScheduler.calcular(inicio, plan)` usa `plan.horaFinal`, intervalos y `prioridadOmitir` para elegir qué comidas omitir. Comportamiento idéntico al actual con el plan predeterminado (agregar ese plan como recurso `res/raw/plan_predeterminado.json`).
- Widget, notificaciones y app muestran `nombre` y `resumen` del plan.
- Pantalla para importar un plan pegando JSON o abriendo un archivo `.json`, con validación equivalente a `validarPlan` (mensajes en español).
- Migración: instalaciones existentes pasan al plan predeterminado sin perder el día en curso.
- Mantener `USE_EXACT_ALARM` y el instalador actual.

**Aceptación:** todas las pruebas existentes pasan con el plan predeterminado; pruebas nuevas para un plan de 3 y de 6 comidas y para JSON inválido.
