/**
 * Copia el contenido local (data/polso.db + uploads/) a producción (Turso + Vercel Blob).
 *
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… BLOB_READ_WRITE_TOKEN=… npm run push:cloud
 *
 * Reemplaza por completo el contenido de producción con el local. Úsalo solo para la carga inicial.
 */
import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, config } from '../src/config.js';
import { client as remote, ready } from '../src/db.js';
import { resources } from '../src/resources.js';
import { saveImage } from '../src/storage.js';

if (!process.env.TURSO_DATABASE_URL || !config.blobToken) {
  console.error('Faltan TURSO_DATABASE_URL, TURSO_AUTH_TOKEN o BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

const local = createClient({ url: `file:${path.join(ROOT, 'data', 'polso.db')}` });
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const uploaded = new Map();

async function migrateImage(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  if (uploaded.has(url)) return uploaded.get(url);
  const file = path.basename(url);
  const blobUrl = await saveImage(await readFile(path.join(config.uploadsDir, file)), file, TYPES[file.split('.').pop().toLowerCase()] || 'image/jpeg');
  uploaded.set(url, blobUrl);
  return blobUrl;
}

await ready; // crea las tablas en producción
for (const [table, def] of [...Object.entries(resources), ['settings', { fields: [] }]]) {
  const rows = (await local.execute(`SELECT * FROM ${table}`)).rows;
  const images = def.fields.filter((f) => f.type === 'image').map((f) => f.name);
  const stmts = [{ sql: `DELETE FROM ${table}`, args: [] }];
  for (const r of rows) {
    const row = Object.fromEntries(Object.entries(r));
    for (const k of images) row[k] = await migrateImage(row[k]);
    if (table === 'settings' && row.key === 'hero_image') row.value = await migrateImage(row.value);
    const cols = Object.keys(row);
    stmts.push({ sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, args: Object.values(row) });
  }
  await remote.batch(stmts, 'write');
  console.log(`  ✓ ${table}: ${rows.length} filas`);
}
console.log(`\nListo. ${uploaded.size} imágenes subidas a Vercel Blob.`);
