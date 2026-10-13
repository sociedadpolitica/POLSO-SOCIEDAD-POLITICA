import express from 'express';
import { db, getSettings, ready } from '../db.js';
import { renderRich, readingTime, embedUrl } from '../markdown.js';
import { getLatestPost } from '../services/instagram.js';
import { AREAS } from '../resources.js';

const AREA_INFO = {
  'Dirección': { icon: '★', text: 'Lidera la línea editorial y el rumbo de cada temporada.' },
  'Televisión': { icon: '◉', text: 'Producción audiovisual, presentación y cubrimiento en cámara.' },
  'Radio': { icon: '◖', text: 'Podcast, entrevistas y la voz de POLSO al aire.' },
  'Redes sociales': { icon: '✦', text: 'La conversación diaria con nuestra comunidad digital.' },
  'Diseño gráfico': { icon: '◆', text: 'La identidad visual detrás de cada pieza.' },
  'Sitio web': { icon: '⌘', text: 'Esta plataforma y todo lo que vive en ella.' },
  'Docente': { icon: '◎', text: 'Acompañamiento académico del proyecto.' },
};

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtHour = (t) => { const [h, m] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`; };

/** ¿Está el programa al aire ahora? (hora de Colombia, UTC−5) */
function radioStatus(site) {
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  const day = DAYS[now.getUTCDay()], min = now.getUTCHours() * 60 + now.getUTCMinutes();
  const live = day === site.radio_day && min >= toMin(site.radio_start) && min < toMin(site.radio_end);
  return { live, schedule: `Todos los ${site.radio_day} · ${fmtHour(site.radio_start)} a ${fmtHour(site.radio_end)}` };
}

async function teamByArea() {
  const all = await db.all('SELECT * FROM members ORDER BY position, id');
  return AREAS.map((area) => ({ area, ...AREA_INFO[area], members: all.filter((m) => m.area === area) })).filter((g) => g.members.length);
}

const router = express.Router();
// Express 4 no captura errores de funciones async: este envoltorio los pasa al manejador de errores
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Autor: si la publicación tiene nombre de invitado se usan solo sus datos;
// si no, se usan todos los del integrante del equipo (incluida su foto de perfil).
// Se exponen como by_* para no chocar con las columnas author_* de la tabla.
const GUEST = "NULLIF(a.author_full_name, '') IS NOT NULL";
const pick = (f, mf = f) => `CASE WHEN ${GUEST} THEN NULLIF(a.author_${f}, '') ELSE m.${mf} END`;
const ARTICLE_SQL = `SELECT a.*,
    ${pick('full_name', 'name')} AS by_name, ${pick('photo')} AS by_photo,
    ${pick('profession')} AS by_profession, ${pick('studies')} AS by_studies, ${pick('workplace')} AS by_workplace,
    CASE WHEN ${GUEST} THEN NULLIF(a.author_profession, '') ELSE COALESCE(NULLIF(m.role, ''), m.area) END AS by_role,
    CASE WHEN ${GUEST} THEN NULL ELSE m.slug END AS by_slug,
    CASE WHEN ${GUEST} THEN NULL ELSE m.bio END AS by_bio
  FROM articles a LEFT JOIN members m ON m.id = a.author_id WHERE a.published = 1`;

// Datos comunes para todas las vistas
router.use(ah(async (req, res, next) => {
  await ready;
  res.locals.site = await getSettings();
  res.locals.path = req.path;
  res.locals.radio = radioStatus(res.locals.site);
  res.locals.slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.locals.readingTime = readingTime;
  res.locals.fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  next();
}));

router.get('/', ah(async (_req, res) => {
  const articles = await db.all(`${ARTICLE_SQL} ORDER BY a.featured DESC, a.published_at DESC LIMIT 13`);
  const [lead, ...rest] = articles;
  res.render('index', {
    title: null, hasHero: true, lead, secondary: rest.slice(0, 3), more: rest.slice(3),
    magazines: await db.all('SELECT * FROM magazines ORDER BY published_at DESC LIMIT 3'),
    episode: await db.get('SELECT * FROM episodes ORDER BY published_at DESC LIMIT 1'),
    team: await db.all('SELECT id FROM members'),
    areas: (await teamByArea()).filter((g) => g.area !== 'Docente'),
    instagram: await getLatestPost(res.locals.site),
    embedUrl,
  });
}));

router.get('/publicaciones', ah(async (req, res) => {
  const kind = req.query.tipo || '';
  const rows = kind ? await db.all(`${ARTICLE_SQL} AND a.kind = ? ORDER BY a.published_at DESC`, kind)
                    : await db.all(`${ARTICLE_SQL} ORDER BY a.published_at DESC`);
  const kinds = (await db.all('SELECT DISTINCT kind FROM articles WHERE published = 1')).map(r => r.kind);
  res.render('articles', { title: 'Publicaciones', articles: rows, kinds, kind });
}));

router.get('/publicaciones/:slug', ah(async (req, res, next) => {
  const a = await db.get(`${ARTICLE_SQL} AND a.slug = ?`, req.params.slug);
  if (!a) return next();
  const related = await db.all(`${ARTICLE_SQL} AND a.id != ? ORDER BY (a.section = ?) DESC, a.published_at DESC LIMIT 3`, a.id, a.section);
  res.render('article', { title: a.title, description: a.excerpt, image: a.cover, a, html: renderRich(a.body), related });
}));

router.get('/equipo', ah(async (_req, res) => {
  const groups = await teamByArea();
  res.render('team', { title: 'Equipo POLSO', hasHero: true, groups, total: groups.reduce((n, g) => n + g.members.length, 0) });
}));

router.get('/equipo/:slug', ah(async (req, res, next) => {
  const m = await db.get('SELECT * FROM members WHERE slug = ?', req.params.slug);
  if (!m) return next();
  const articles = await db.all(`${ARTICLE_SQL} AND a.author_id = ? ORDER BY a.published_at DESC`, m.id);
  res.render('member', { title: m.name, image: m.photo, m, articles });
}));

router.get('/revistas', ah(async (_req, res) => {
  res.render('magazines', { title: 'Revistas', magazines: await db.all('SELECT * FROM magazines ORDER BY published_at DESC') });
}));

router.get('/podcast', ah(async (_req, res) => {
  res.render('podcast', { title: 'Podcast', episodes: await db.all('SELECT * FROM episodes ORDER BY published_at DESC'), embedUrl });
}));

export default router;
