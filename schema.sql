-- OnTime Cloud — esquema D1 (SQLite). Núcleo: cambios solo con aprobación de Claude.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,                 -- uuid
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  nombre      TEXT NOT NULL DEFAULT '',
  rol         TEXT NOT NULL CHECK (rol IN ('paciente','nutricionista')),
  creado      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  code            TEXT PRIMARY KEY,             -- 8 caracteres sin ambiguos
  nutricionista   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira          TEXT NOT NULL,
  usado_por       TEXT REFERENCES users(id) ON DELETE SET NULL,
  usado_en        TEXT
);

CREATE TABLE IF NOT EXISTS links (
  id                TEXT PRIMARY KEY,
  nutricionista     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paciente          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  estado            TEXT NOT NULL CHECK (estado IN ('active','revoked')),
  consentimiento_v  TEXT NOT NULL,                -- versión del texto aceptado
  consentido_en     TEXT NOT NULL,
  revocado_en       TEXT,
  revocado_por      TEXT
);
-- Un solo vínculo activo por par.
CREATE UNIQUE INDEX IF NOT EXISTS links_par_activo ON links(nutricionista, paciente) WHERE estado = 'active';

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  paciente    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  autor       TEXT NOT NULL REFERENCES users(id),
  estado      TEXT NOT NULL CHECK (estado IN ('active','pending','archived','rejected')),
  json        TEXT NOT NULL,                     -- Plan v1 validado por src/plan.ts
  creado      TEXT NOT NULL DEFAULT (datetime('now')),
  decidido    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_un_activo ON plans(paciente) WHERE estado = 'active';

CREATE TABLE IF NOT EXISTS meal_logs (
  paciente    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fecha       TEXT NOT NULL,                     -- YYYY-MM-DD local del paciente
  comida_id   TEXT NOT NULL,
  planificada TEXT NOT NULL,                     -- HH:mm
  hecha       TEXT,                              -- HH:mm o NULL si no se marcó
  opcional    INTEGER NOT NULL DEFAULT 0,
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (paciente, fecha, comida_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,
  nutricionista TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paciente      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto         TEXT NOT NULL CHECK (length(texto) <= 4000),
  creado        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  actor   TEXT NOT NULL,
  accion  TEXT NOT NULL,
  sujeto  TEXT,
  en      TEXT NOT NULL DEFAULT (datetime('now'))
);
