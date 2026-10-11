import { createClient } from '@libsql/client';
import { config } from './config.js';
import { resources, settingsSchema } from './resources.js';

export const client = createClient({ url: config.dbUrl, authToken: config.dbToken });

const plain = (row) => (row ? Object.fromEntries(Object.entries(row)) : row);

/** Consultas asíncronas: funcionan igual con el archivo local y con Turso. */
export const db = {
  all: async (sql, ...args) => (await client.execute({ sql, args })).rows.map(plain),
  get: async (sql, ...args) => plain((await client.execute({ sql, args })).rows[0]),
  run: async (sql, ...args) => {
    const r = await client.execute({ sql, args });
    return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null };
  },
};

export function slugify(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
}

export async function uniqueSlug(table, base, id = null) {
  let slug = slugify(base), n = 1;
  while (await db.get(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`, slug, id)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

export async function getSettings() {
  const out = {};
  for (const g of settingsSchema) for (const f of g.fields) out[f.name] = f.default ?? '';
  for (const { key, value } of await db.all('SELECT key, value FROM settings')) out[key] = value;
  return out;
}

export async function saveSettings(values) {
  const allowed = new Set(settingsSchema.flatMap((g) => g.fields.map((f) => f.name)));
  const stmts = Object.entries(values).filter(([k]) => allowed.has(k)).map(([k, v]) => ({
    sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [k, v == null ? '' : String(v)],
  }));
  if (stmts.length) await client.batch(stmts, 'write');
}

// Equipo de la Temporada XIV (fotos recortadas de la foto grupal, áreas según el reel oficial).
// Los nombres se completan desde el panel.
const TEAM_XIV = [
  [22, 'Docente', 'Docente'],
  [1, 'Dirección', 'Director general'],
  [3, 'Radio'], [5, 'Radio'], [15, 'Radio'], [16, 'Radio'], [17, 'Radio'], [20, 'Radio'],
  [2, 'Televisión'], [4, 'Televisión'], [6, 'Televisión'], [8, 'Televisión'], [9, 'Televisión'], [12, 'Televisión'], [19, 'Televisión'],
  [11, 'Redes sociales'], [13, 'Redes sociales'], [21, 'Redes sociales'],
  [7, 'Diseño gráfico'], [10, 'Diseño gráfico'],
  [14, 'Sitio web'], [18, 'Sitio web'],
];

const SQL_TYPES = { number: 'INTEGER', checkbox: 'INTEGER', relation: 'INTEGER' };

/** Crea/migra las tablas a partir del esquema y siembra el contenido inicial. */
async function migrate() {
  for (const [table, def] of Object.entries(resources)) {
    await client.execute(`CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    const existing = new Set((await db.all(`PRAGMA table_info(${table})`)).map((c) => c.name));
    for (const f of def.fields) {
      if (!f.name) continue; // encabezados visuales del formulario
      if (!existing.has(f.name)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${f.name} ${SQL_TYPES[f.type] || 'TEXT'}`);
    }
  }
  await client.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

  if (!(await db.get("SELECT COUNT(*) AS n FROM members WHERE photo LIKE '/static/img/equipo/%'")).n) {
    for (const [i, [n, area, role]] of TEAM_XIV.entries()) {
      const num = String(n).padStart(2, '0');
      await db.run('INSERT INTO members (slug, name, area, role, photo, position) VALUES (?, ?, ?, ?, ?, ?)',
        await uniqueSlug('members', area === 'Docente' ? 'docente' : `integrante-${num}`), area === 'Docente' ? 'Docente' : `Integrante ${num}`,
        area, role || `Equipo de ${area.toLowerCase()}`, `/static/img/equipo/integrante-${num}.jpg`, area === 'Docente' ? 0 : i + 1);
    }
  }
  // Migraciones de datos anteriores
  await db.run("UPDATE members SET area = 'Docente', role = 'Docente' WHERE area = 'Docencia y asesoría'");
  await db.run("UPDATE members SET position = 0 WHERE area = 'Docente'");
}

// Promesa única: las rutas esperan a que la base esté lista (importante en serverless)
export const ready = migrate();
