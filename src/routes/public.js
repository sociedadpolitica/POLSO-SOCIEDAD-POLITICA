import express from 'express';
import { db, getSettings } from '../db.js';
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

function teamByArea() {
  const all = db.prepare('SELECT * FROM members ORDER BY position, id').all();
  return AREAS.map((area) => ({ area, ...AREA_INFO[area], members: all.filter((m) => m.area === area) })).filter((g) => g.members.length);
}

const router = express.Router();

const pick = (f, mf = f) => `COALESCE(NULLIF(a.author_${f}, ''), m.${mf})`;
const ARTICLE_SQL = `SELECT a.*,
    ${pick('full_name', 'name')} AS author_name, ${pick('photo')} AS author_photo,
    ${pick('profession')} AS author_profession, ${pick('studies')} AS author_studies, ${pick('workplace')} AS author_workplace,
    COALESCE(NULLIF(a.author_profession, ''), m.role) AS author_role,
    CASE WHEN NULLIF(a.author_full_name, '') IS NULL THEN m.slug END AS author_slug, m.bio AS author_bio
  FROM articles a LEFT JOIN members m ON m.id = a.author_id WHERE a.published = 1`;

// Datos comunes para todas las vistas
router.use((req, res, next) => {
  res.locals.site = getSettings();
  res.locals.path = req.path;
  res.locals.radio = radioStatus(res.locals.site);
  res.locals.slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.locals.readingTime = readingTime;
  res.locals.fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  next();
});

router.get('/', async (_req, res) => {
  const articles = db.prepare(`${ARTICLE_SQL} ORDER BY a.featured DESC, a.published_at DESC LIMIT 13`).all();
  const [lead, ...rest] = articles;
  res.render('index', {
    title: null, hasHero: true, lead, secondary: rest.slice(0, 3), more: rest.slice(3),
    magazines: db.prepare('SELECT * FROM magazines ORDER BY published_at DESC LIMIT 4').all(),
    episode: db.prepare('SELECT * FROM episodes ORDER BY published_at DESC LIMIT 1').get(),
    team: db.prepare('SELECT * FROM members WHERE photo IS NOT NULL AND photo != \'\' ORDER BY position, id').all(),
    areas: teamByArea().filter((g) => g.area !== 'Docente'),
    instagram: await getLatestPost(res.locals.site),
    embedUrl,
  });
});

router.get('/publicaciones', (req, res) => {
  const kind = req.query.tipo || '';
  const rows = kind ? db.prepare(`${ARTICLE_SQL} AND a.kind = ? ORDER BY a.published_at DESC`).all(kind)
                    : db.prepare(`${ARTICLE_SQL} ORDER BY a.published_at DESC`).all();
  const kinds = db.prepare('SELECT DISTINCT kind FROM articles WHERE published = 1').all().map(r => r.kind);
  res.render('articles', { title: 'Publicaciones', articles: rows, kinds, kind });
});

router.get('/publicaciones/:slug', (req, res, next) => {
  const a = db.prepare(`${ARTICLE_SQL} AND a.slug = ?`).get(req.params.slug);
  if (!a) return next();
  const related = db.prepare(`${ARTICLE_SQL} AND a.id != ? ORDER BY (a.section = ?) DESC, a.published_at DESC LIMIT 3`).all(a.id, a.section);
  res.render('article', { title: a.title, description: a.excerpt, image: a.cover, a, html: renderRich(a.body), related });
});

router.get('/equipo', (_req, res) => {
  const groups = teamByArea();
  res.render('team', { title: 'Equipo POLSO', hasHero: true, groups, total: groups.reduce((n, g) => n + g.members.length, 0) });
});

router.get('/equipo/:slug', (req, res, next) => {
  const m = db.prepare('SELECT * FROM members WHERE slug = ?').get(req.params.slug);
  if (!m) return next();
  const articles = db.prepare(`${ARTICLE_SQL} AND a.author_id = ? ORDER BY a.published_at DESC`).all(m.id);
  res.render('member', { title: m.name, image: m.photo, m, articles });
});

router.get('/revistas', (_req, res) => {
  res.render('magazines', { title: 'Revistas', magazines: db.prepare('SELECT * FROM magazines ORDER BY published_at DESC').all() });
});

router.get('/podcast', (_req, res) => {
  res.render('podcast', { title: 'Podcast', episodes: db.prepare('SELECT * FROM episodes ORDER BY published_at DESC').all(), embedUrl });
});

export default router;
