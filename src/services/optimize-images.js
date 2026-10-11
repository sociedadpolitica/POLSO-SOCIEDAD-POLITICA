/**
 * Re-optimiza las imágenes ya subidas (las anteriores a la compresión automática).
 * Descarga cada imagen que no sea WebP, la guarda optimizada, actualiza la base y borra la original.
 * Es idempotente: las que ya son .webp se saltan.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, ready, getSettings, saveSettings } from '../db.js';
import { resources } from '../resources.js';
import { config } from '../config.js';
import { saveImage, deleteImage } from '../storage.js';

const isUploaded = (u) => u && (u.startsWith('/uploads/') || u.includes('.blob.vercel-storage.com/')) && !/\.(webp|gif)$/i.test(u);
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', avif: 'image/avif' };

async function load(url) {
  if (url.startsWith('/uploads/')) return readFile(path.join(config.uploadsDir, path.basename(url)));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function optimizeExistingImages(log = console.log) {
  await ready;
  const done = new Map(); // la misma imagen puede estar en varias filas
  let saved = 0, before = 0, after = 0;
  const convert = async (url) => {
    if (done.has(url)) return done.get(url);
    const buf = await load(url);
    const name = path.basename(new URL(url, 'http://x').pathname);
    const next = await saveImage(buf, name, TYPES[name.split('.').pop().toLowerCase()] || 'image/jpeg');
    const newSize = (await load(next)).length;
    before += buf.length; after += newSize; saved++;
    log(`  ✓ ${name}: ${Math.round(buf.length / 1024)} KB → ${Math.round(newSize / 1024)} KB`);
    done.set(url, next);
    return next;
  };

  for (const [table, def] of Object.entries(resources)) {
    const fields = def.fields.filter((f) => f.type === 'image').map((f) => f.name);
    for (const row of await db.all(`SELECT id, ${fields.join(', ')} FROM ${table}`)) {
      for (const f of fields) {
        if (!isUploaded(row[f])) continue;
        try { await db.run(`UPDATE ${table} SET ${f} = ? WHERE id = ?`, await convert(row[f]), row.id); }
        catch (e) { log(`  ⚠ ${row[f]}: ${e.message}`); }
      }
    }
  }
  const s = await getSettings();
  if (isUploaded(s.hero_image)) await saveSettings({ hero_image: await convert(s.hero_image) });

  for (const old of done.keys()) await deleteImage(old);
  return { images: saved, beforeKB: Math.round(before / 1024), afterKB: Math.round(after / 1024) };
}
