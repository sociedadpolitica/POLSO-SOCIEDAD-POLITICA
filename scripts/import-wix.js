/**
 * Importa el contenido del sitio anterior en Wix (columnas, revistas y podcast).
 *
 *   npm run import:wix
 *
 * Es idempotente: si una publicación, revista o episodio ya existe (por su slug),
 * no se vuelve a crear. Las imágenes se descargan a /uploads.
 */
import { writeFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, uniqueSlug, slugify } from '../src/db.js';
import { config } from '../src/config.js';

const BASE = 'https://polsosp.wixsite.com/polso';
// Entradillas escritas a mano para las columnas importadas (título → resumen)
const EXCERPTS = JSON.parse(await readFile(new URL('./wix-excerpts.json', import.meta.url), 'utf8'));
const MONTHS = { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 };
// Páginas del sitemap que no son columnas
const NOT_COLUMNS = new Set(['', 'columnas', 'equipo-polso', 'copia-de-equipo-polso', 'projects-8']);

const MAGAZINES = [
  { title: 'Paz en el Territorio', edition: '5ª', image: '860375_e472bcfc73784d4faa85e0a5eed3d58f~mv2.jpg', link: 'https://drive.google.com/file/d/1GhbwyC6N4IL4W2P6f7uvzL7Fi0aXUPvS/view?usp=sharing', date: '2026-03-01', description: 'La nueva revista de POLSO.' },
  { title: 'Revista POLSO · Cuarta edición', edition: '4ª', image: '860375_e350989066dc46ba83448b8532524e8f~mv2.jpg', link: 'https://drive.google.com/drive/folders/1p8jmK2YEM01yGDhc1sP0p8awwBEOTB_2?usp=drive_link', date: '2025-06-01' },
  { title: 'Revista POLSO · Tercera edición', edition: '3ª', image: '860375_47d7a23517024e1dbb4152fac84ace75~mv2.jpg', link: 'https://issuu.com/polsorevista/docs/tercera_edici_n_de_la_revista_polso', date: '2024-06-01' },
  { title: 'Revista POLSO · Segunda edición', edition: '2ª', image: '860375_e272f40345134734abfb1313e459933c~mv2.png', link: 'https://issuu.com/polsorevista/docs/revista_pol_tica_polso_edici_n_ii_2023_2_', date: '2023-12-01' },
  { title: 'Revista POLSO · Primera edición', edition: '1ª', image: '860375_2c840a130cf44d5eabaee05d24767cd0~mv2.png', link: 'https://drive.google.com/file/d/1pdsnFanyr9Pxgj7Set1AgG33FTUzXk-d/view?usp=sharing', date: '2023-06-01' },
];

const EPISODES = [
  { title: 'Podcast de opinión', number: 1, link: 'https://drive.google.com/drive/folders/1tRHWdT65oISHG_EOqvG68AksSyRSSD4o?usp=sharing', date: '2026-03-01',
    description: 'Proyecto realizado por estudiantes de quinto semestre de Comunicación Social en la materia Géneros de Opinión. Escoge el que más te guste y pasa un rato agradable.' },
];

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  ndash: '–', mdash: '—', hellip: '…', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', middot: '·', bull: '•' };
const decode = (s) => s.replace(/&([a-z]+);/gi, (m, name) => {
  if (ENTITIES[name]) return ENTITIES[name];
  // Vocales acentuadas y eñes: &aacute; &Ntilde; &uuml; …
  const acc = name.match(/^([a-z])(acute|grave|tilde|uml|circ)$/i);
  return acc ? (acc[1] + { acute: '\u0301', grave: '\u0300', tilde: '\u0303', uml: '\u0308', circ: '\u0302' }[acc[2]]).normalize('NFC') : m;
}).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET con pausa y reintentos: Wix responde 429 si se piden muchas páginas seguidas. */
async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 POLSO-importer' } });
    if (r.ok) { await sleep(600); return r.text(); }
    if (r.status !== 429 || i >= tries) throw new Error(`${r.status} ${url}`);
    await sleep(3000 * i);
  }
}

/** Bloques de texto enriquecido de una página Wix, en orden. */
function textBlocks(page) {
  return [...page.matchAll(/data-testid="richTextElement"[^>]*>([\s\S]*?)<\/div>/g)].map(([, inner]) => {
    const paras = [...inner.matchAll(/<(p|h\d|li)[^>]*>([\s\S]*?)<\/\1>/g)].map(([, , p]) =>
      decode(p.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[​ ]/g, ' ').replace(/[ \t]+/g, ' ').trim());
    return paras.filter(Boolean).join('\n\n').trim();
  }).filter(Boolean);
}

const images = (page) => [...new Set([...page.matchAll(/https:\/\/static\.wixstatic\.com\/media\/([^"\\ )/?]+)/g)].map((m) => m[1].replace('%7E', '~')))];

function parseDate(str) {
  const m = str.toLowerCase().match(/(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})/);
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

async function download(id) {
  const file = `wix-${id.replace(/[^\w.-]/g, '_')}`;
  const dest = path.join(config.uploadsDir, file);
  try { await access(dest); } catch {
    const r = await fetch(`https://static.wixstatic.com/media/${id}`);
    if (!r.ok) throw new Error(`No se pudo descargar ${id}`);
    await writeFile(dest, Buffer.from(await r.arrayBuffer()));
  }
  return `/uploads/${file}`;
}

function parseColumn(blocks) {
  const start = blocks.findIndex((b) => /^sociedad pol[ií]tica$/i.test(b)) + 1;
  const end = blocks.findIndex((b) => /^Encu[eé]ntralo tambi[eé]n/i.test(b));
  const content = blocks.slice(start, end > 0 ? end : undefined);
  const byIdx = content.findIndex((b) => /^Por:/i.test(b));
  const dateIdx = content.findIndex((b) => parseDate(b) && b.length < 40);
  const title = (content[0] || '').replace(/\s+/g, ' ').trim();
  let author = '', profession = '';
  if (byIdx >= 0) {
    const lines = content[byIdx].replace(/^Por:\s*/i, '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    author = lines.shift() || '';
    profession = lines.join(' · ');
  }
  const bodyFrom = Math.max(byIdx, dateIdx, 0) + 1;
  const body = content.slice(bodyFrom).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, author, profession, date: dateIdx >= 0 ? parseDate(content[dateIdx]) : null, body };
}

async function importColumns() {
  const sitemap = await get(`${BASE}/pages-sitemap.xml`);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    .filter((u) => !NOT_COLUMNS.has(decodeURIComponent(u.replace(BASE, '').replace(/^\//, ''))));

  const pages = [];
  for (const url of urls) {
    try { pages.push({ url, html: await get(url) }); } catch (e) { console.warn('  ⚠', e.message); }
  }
  // Las imágenes que se repiten en varias páginas son logos/plantilla, no de la columna
  const freq = new Map();
  pages.forEach((p) => images(p.html).forEach((i) => freq.set(i, (freq.get(i) || 0) + 1)));

  let created = 0;
  for (const { url, html } of pages) {
    const c = parseColumn(textBlocks(html));
    if (!c.title || c.body.length < 200) { console.warn('  ⚠ Sin contenido suficiente:', url); continue; }
    if (/^sociedad pol/i.test(c.title)) { console.warn('  ⚠ No se pudo leer el título:', url); continue; }
    if (db.prepare('SELECT 1 FROM articles WHERE title = ? OR slug = ?').get(c.title, slugify(c.title))) continue;
    const own = images(html).filter((i) => freq.get(i) === 1 && /\.(jpe?g|png|webp)$/i.test(i));
    const photo = own[0] ? await download(own[0]) : '';
    const excerpt = EXCERPTS[c.title] || c.body.split('\n\n')[0].slice(0, 220).replace(/\s+\S*$/, '') + '…';
    db.prepare(`INSERT INTO articles (slug, title, kind, section, excerpt, body, author_full_name, author_profession, author_photo, published_at, featured, published)
      VALUES (?, ?, 'columna', 'Opinión', ?, ?, ?, ?, ?, ?, 0, 1)`)
      .run(uniqueSlug('articles', c.title), c.title, excerpt, c.body, c.author, c.profession, photo, c.date || new Date().toISOString().slice(0, 10));
    created++;
    console.log(`  ✓ ${c.title} — ${c.author || 'sin autor'}`);
  }
  return created;
}

async function importSimple(table, items, map) {
  let created = 0;
  for (const it of items) {
    if (db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`).get(slugify(it.title))) continue;
    const cover = it.image ? await download(it.image) : '';
    const row = { slug: uniqueSlug(table, it.title), ...map(it, cover) };
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(row));
    created++;
    console.log(`  ✓ ${it.title}`);
  }
  return created;
}

console.log('Importando columnas…');
const cols = await importColumns();
console.log('Importando revistas…');
const mags = await importSimple('magazines', MAGAZINES, (m, cover) => ({ title: m.title, edition: m.edition, description: m.description || '', cover, link: m.link, published_at: m.date }));
console.log('Importando podcast…');
const eps = await importSimple('episodes', EPISODES, (e, cover) => ({ title: e.title, number: e.number, description: e.description, cover, link: e.link, published_at: e.date }));
console.log(`\nListo: ${cols} columnas, ${mags} revistas, ${eps} episodios nuevos.`);
