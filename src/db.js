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

const SQL_TYPES = { number: 'INTEGER', checkbox: 'INTEGER', relation: 'INTEGER' };

/** Crea/migra las tablas a partir del esquema declarativo. */
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

  // Tareas de mantenimiento que se ejecutan una sola vez por base de datos
  await once('_members_cleared', async () => {
    // Se vació el equipo de ejemplo para cargar el de la nueva temporada desde el panel
    await db.run('DELETE FROM members');
    await db.run('UPDATE articles SET author_id = NULL');
  });
  await once('_team_xiv_students', async () => {
    // Estudiantes de la Temporada XIV con su comité. Las fotos se suben desde el panel.
    const STUDENTS = [
      ['Evelin Daniela Sanguino Acosta', 'Redes sociales'],
      ['Steeven Andrey Zuleta Ropero', 'Diseño gráfico'],
      ['Karent Lorena Joya Vargas', 'Radio'],
      ['Maidu Díaz Sánchez', 'Redes sociales'],
      ['Nicolás Guerra Martínez', 'Sitio web'],
      ['Zharick Solano Rincón', 'Televisión'],
      ['Natalia Reyes Rangel', 'Radio'],
      ['Valentina Pallares García', 'Televisión'],
      ['Ximena Villamizar Sánchez', 'Redes sociales'],
      ['Yarith Cristina Ortega Macgregor', 'Radio'],
    ];
    for (const [i, [name, area]] of STUDENTS.entries()) {
      if (await db.get('SELECT 1 FROM members WHERE name = ?', name)) continue;
      await db.run('INSERT INTO members (slug, name, area, role, position) VALUES (?, ?, ?, ?, ?)',
        await uniqueSlug('members', name), name, area, `Equipo de ${area.toLowerCase()}`, i + 1);
    }
  });
  await once('_images_optimized', async () => {
    // Comprime a WebP las imágenes subidas antes de que existiera la compresión automática
    const { optimizeExistingImages } = await import('./services/optimize-images.js');
    const r = await optimizeExistingImages(() => {}, { waitForDb: false });
    console.log(`[imágenes] ${r.images} optimizadas: ${r.beforeKB} KB → ${r.afterKB} KB`);
  });
}

/** Ejecuta `task` solo la primera vez (la marca queda en settings). Si falla, el sitio sigue funcionando. */
async function once(key, task) {
  const claim = await db.run("INSERT INTO settings (key, value) VALUES (?, datetime('now')) ON CONFLICT(key) DO NOTHING", key);
  if (!claim.changes) return;
  try { await task(); } catch (e) { console.error(`[${key}]`, e); }
}

// Promesa única: las rutas esperan a que la base esté lista (importante en serverless)
export const ready = migrate();
