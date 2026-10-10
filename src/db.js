import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { resources, settingsSchema } from './resources.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

const SQL_TYPES = { number: 'INTEGER', checkbox: 'INTEGER', relation: 'INTEGER' };

// Crea/migra tablas a partir del esquema declarativo
for (const [table, def] of Object.entries(resources)) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const f of def.fields) {
    if (!f.name) continue; // encabezados visuales del formulario
    if (!existing.has(f.name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${f.name} ${SQL_TYPES[f.type] || 'TEXT'}`);
  }
}
db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

export function slugify(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
}

export function uniqueSlug(table, base, id = null) {
  let slug = slugify(base), n = 1;
  const q = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`);
  while (q.get(slug, id)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

export function getSettings() {
  const out = {};
  for (const g of settingsSchema) for (const f of g.fields) out[f.name] = f.default ?? '';
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) out[key] = value;
  return out;
}

export function saveSettings(values) {
  const allowed = new Set(settingsSchema.flatMap(g => g.fields.map(f => f.name)));
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(values)) if (allowed.has(k)) stmt.run(k, v == null ? '' : String(v));
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

function seedTeam() {
  if (db.prepare("SELECT COUNT(*) AS n FROM members WHERE photo LIKE '/static/img/equipo/%'").get().n) return;
  const insert = db.prepare('INSERT INTO members (slug, name, area, role, photo, position) VALUES (?, ?, ?, ?, ?, ?)');
  TEAM_XIV.forEach(([n, area, role], i) => {
    const num = String(n).padStart(2, '0');
    insert.run(uniqueSlug('members', `integrante-${num}`), `Integrante ${num}`, area, role || `Equipo de ${area.toLowerCase()}`, `/static/img/equipo/integrante-${num}.jpg`, i + 1);
  });
}

// Contenido inicial para que el sitio no arranque vacío
if (!db.prepare('SELECT COUNT(*) AS n FROM members').get().n) {
  db.prepare(`INSERT INTO articles (slug, title, kind, section, excerpt, body, author_id, published_at, featured, published)
    VALUES (?, ?, 'columna', 'Opinión', ?, ?, 1, date('now'), 1, 1)`).run(
    'la-construccion-de-la-politica-nos-corresponde-a-todos',
    'La construcción de la política nos corresponde a todos',
    'La política no se limita a ostentar el poder, ocupar un cargo público o debatir en los partidos.',
    'La política no se limita a ostentar el poder, ocupar un cargo público o debatir en los partidos.\n\nEdita este texto desde el panel de administración en **/admin**.\n\n> Liderando desde la opinión.'
  );
}

seedTeam();
// El docente encabeza el equipo
db.prepare("UPDATE members SET position = 0 WHERE area = 'Docente'").run();
// Migración: se eliminó el área de columnistas y la docencia pasó a llamarse «Docente»
db.prepare("UPDATE members SET area = 'Docente', role = 'Docente' WHERE area = 'Docencia y asesoría'").run();
