import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, uniqueSlug, getSettings, saveSettings, ready } from '../db.js';
import { resources, settingsSchema } from '../resources.js';
import { saveImage, deleteImage } from '../storage.js';
import { runWixImport } from '../services/wix-import.js';
import { optimizeExistingImages } from '../services/optimize-images.js';
import { checkCredentials, createSession, destroySession, requireAdmin, isAdmin, loginRateLimit } from '../auth.js';

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.use(express.json({ limit: '2mb' }));
router.use(ah(async (_req, _res, next) => { await ready; next(); }));

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // límite de cuerpo de las funciones de Vercel (4,5 MB)
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

router.get('/stats', ah(async (_req, res) => {
  const counts = {};
  for (const t of Object.keys(resources)) counts[t] = (await db.get(`SELECT COUNT(*) n FROM ${t}`)).n;
  const recent = await db.all('SELECT id, title, kind, published, updated_at FROM articles ORDER BY updated_at DESC LIMIT 5');
  res.json({ counts, recent });
}));

// ── Subida de imágenes ──────────────────────────────────
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${IMAGE_TYPES[req.file.mimetype]}`;
    saveImage(req.file.buffer, name, req.file.mimetype)
      .then((url) => res.json({ url }))
      .catch((e) => { console.error(e); res.status(500).json({ error: 'No se pudo guardar la imagen' }); });
  });
});

// ── Importar el contenido del Wix anterior (se puede repetir sin duplicar) ──
router.post('/import-wix', ah(async (_req, res) => {
  const lines = [];
  const result = await runWixImport((...a) => lines.push(a.join(' ')));
  res.json({ ...result, log: lines });
}));

// ── Comprimir las imágenes subidas antes de la compresión automática ──
router.post('/optimize-images', ah(async (_req, res) => {
  const lines = [];
  res.json({ ...(await optimizeExistingImages((...a) => lines.push(a.join(' ')))), log: lines });
}));

// ── Ajustes ─────────────────────────────────────────────
router.get('/settings', ah(async (_req, res) => res.json(await getSettings())));
router.put('/settings', ah(async (req, res) => { await saveSettings(req.body || {}); res.json(await getSettings()); }));

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

const byId = (table, id) => db.get(`SELECT * FROM ${table} WHERE id = ?`, id);

router.get('/:resource', ah(async (req, res) => {
  res.json(await db.all(`SELECT * FROM ${req.table} ORDER BY ${req.def.order}`));
}));

router.get('/:resource/:id', ah(async (req, res) => {
  const row = await byId(req.table, req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'No encontrado' });
}));

router.post('/:resource', ah(async (req, res) => {
  const data = clean(req.def, req.body || {});
  for (const f of req.def.fields) if (f.name && !(f.name in data) && f.default !== undefined) data[f.name] = f.default;
  const error = validate(req.def, data);
  if (error) return res.status(400).json({ error });
  if (req.def.fields.some((f) => f.name === 'published_at') && !data.published_at) data.published_at = new Date().toISOString().slice(0, 10);
  data.slug = await uniqueSlug(req.table, data.title || data.name);
  const cols = Object.keys(data);
  const { lastInsertRowid } = await db.run(`INSERT INTO ${req.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...Object.values(data));
  res.status(201).json(await byId(req.table, lastInsertRowid));
}));

router.put('/:resource/:id', ah(async (req, res) => {
  const current = await byId(req.table, req.params.id);
  if (!current) return res.status(404).json({ error: 'No encontrado' });
  const data = clean(req.def, req.body || {});
  const error = validate(req.def, { ...current, ...data });
  if (error) return res.status(400).json({ error });
  const title = data.title || data.name;
  if (title && title !== (current.title || current.name)) data.slug = await uniqueSlug(req.table, title, current.id);
  const cols = Object.keys(data);
  if (cols.length) await db.run(`UPDATE ${req.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...Object.values(data), current.id);
  res.json(await byId(req.table, current.id));
}));

router.delete('/:resource/:id', ah(async (req, res) => {
  const row = await byId(req.table, req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  if (req.table === 'members') await db.run('UPDATE articles SET author_id = NULL WHERE author_id = ?', row.id);
  await db.run(`DELETE FROM ${req.table} WHERE id = ?`, row.id);
  // Limpia las imágenes subidas del registro borrado
  for (const f of req.def.fields.filter((f) => f.type === 'image')) await deleteImage(row[f.name]);
  res.json({ ok: true });
}));

export default router;
