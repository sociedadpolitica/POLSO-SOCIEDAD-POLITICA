import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { db, uniqueSlug, getSettings, saveSettings } from '../db.js';
import { resources, settingsSchema } from '../resources.js';
import { config } from '../config.js';
import { checkCredentials, createSession, destroySession, requireAdmin, isAdmin, loginRateLimit } from '../auth.js';

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(IMAGE_TYPES[file.mimetype] ? null : new Error('Formato no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.'), Boolean(IMAGE_TYPES[file.mimetype])),
});

// ── Sesión ──────────────────────────────────────────────
router.post('/login', loginRateLimit, (req, res) => {
  const { user, password } = req.body || {};
  if (!checkCredentials(user || '', password || '')) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  createSession(res);
  res.json({ ok: true });
});
router.post('/logout', (_req, res) => { destroySession(res); res.json({ ok: true }); });
router.get('/me', (req, res) => res.json({ authenticated: isAdmin(req) }));

router.use(requireAdmin);

// ── Esquema (alimenta los formularios del panel) ─────────
router.get('/schema', (_req, res) => res.json({ resources, settings: settingsSchema }));

router.get('/stats', (_req, res) => {
  const counts = Object.fromEntries(Object.keys(resources).map(t => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
  const recent = db.prepare(`SELECT id, title, kind, published, updated_at FROM articles ORDER BY updated_at DESC LIMIT 5`).all();
  res.json({ counts, recent });
});

// ── Subida de imágenes ──────────────────────────────────
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

// ── Ajustes ─────────────────────────────────────────────
router.get('/settings', (_req, res) => res.json(getSettings()));
router.put('/settings', (req, res) => { saveSettings(req.body || {}); res.json(getSettings()); });

// ── CRUD genérico ───────────────────────────────────────
router.param('resource', (req, res, next, name) => {
  if (!Object.hasOwn(resources, name)) return res.status(404).json({ error: 'Recurso desconocido' });
  req.def = resources[name]; req.table = name; next();
});

function clean(def, body) {
  const out = {};
  for (const f of def.fields) {
    if (!(f.name in body)) continue;
    let v = body[f.name];
    if (f.type === 'checkbox') v = v ? 1 : 0;
    else if (f.type === 'number' || f.type === 'relation') v = v === '' || v == null ? null : Number(v);
    else v = v == null ? '' : String(v).trim();
    out[f.name] = v;
  }
  return out;
}

function validate(def, data) {
  for (const f of def.fields) if (f.required && !data[f.name]) return `El campo "${f.label}" es obligatorio`;
  return null;
}

router.get('/:resource', (req, res) => {
  res.json(db.prepare(`SELECT * FROM ${req.table} ORDER BY ${req.def.order}`).all());
});

router.get('/:resource/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM ${req.table} WHERE id = ?`).get(req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'No encontrado' });
});

router.post('/:resource', (req, res) => {
  const data = clean(req.def, req.body || {});
  for (const f of req.def.fields) if (!(f.name in data) && f.default !== undefined) data[f.name] = f.default;
  const error = validate(req.def, data);
  if (error) return res.status(400).json({ error });
  if ('published_at' in Object.fromEntries(req.def.fields.map(f => [f.name])) && !data.published_at) data.published_at = new Date().toISOString().slice(0, 10);
  data.slug = uniqueSlug(req.table, data.title || data.name);
  const cols = Object.keys(data);
  const { lastInsertRowid } = db.prepare(`INSERT INTO ${req.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(data));
  res.status(201).json(db.prepare(`SELECT * FROM ${req.table} WHERE id = ?`).get(lastInsertRowid));
});

router.put('/:resource/:id', (req, res) => {
  const current = db.prepare(`SELECT * FROM ${req.table} WHERE id = ?`).get(req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const data = clean(req.def, req.body || {});
  const error = validate(req.def, { ...current, ...data });
  if (error) return res.status(400).json({ error });
  const title = data.title || data.name;
  if (title && title !== (current.title || current.name)) data.slug = uniqueSlug(req.table, title, current.id);
  const cols = Object.keys(data);
  if (cols.length) db.prepare(`UPDATE ${req.table} SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(data), current.id);
  res.json(db.prepare(`SELECT * FROM ${req.table} WHERE id = ?`).get(current.id));
});

router.delete('/:resource/:id', async (req, res) => {
  const row = db.prepare(`SELECT * FROM ${req.table} WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  if (req.table === 'members') db.prepare('UPDATE articles SET author_id = NULL WHERE author_id = ?').run(row.id);
  db.prepare(`DELETE FROM ${req.table} WHERE id = ?`).run(row.id);
  // Limpia imágenes huérfanas del registro borrado
  for (const f of req.def.fields.filter(f => f.type === 'image')) {
    const v = row[f.name];
    if (v?.startsWith('/uploads/')) await unlink(path.join(config.uploadsDir, path.basename(v))).catch(() => {});
  }
  res.json({ ok: true });
});

export default router;
