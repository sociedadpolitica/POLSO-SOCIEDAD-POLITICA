import { put, del } from '@vercel/blob';
import sharp from 'sharp';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const MAX_SIDE = 1600; // px: suficiente para portadas a pantalla completa
const QUALITY = 80;

/**
 * Optimiza una imagen para web: la orienta según EXIF, la limita a 1600 px y la pasa a WebP.
 * Los GIF se dejan igual para no perder la animación.
 */
export async function optimizeImage(buffer, filename, contentType) {
  if (contentType === 'image/gif') return { buffer, filename, contentType };
  const out = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return { buffer: out, filename: filename.replace(/\.[a-z0-9]+$/i, '') + '.webp', contentType: 'image/webp' };
}

/** Guarda una imagen optimizada y devuelve su URL pública (Vercel Blob en producción, disco en local). */
export async function saveImage(buffer, filename, contentType) {
  ({ buffer, filename, contentType } = await optimizeImage(buffer, filename, contentType));
  if (config.blobToken) {
    const blob = await put(`polso/${filename}`, buffer, { access: 'public', contentType, token: config.blobToken, addRandomSuffix: false, allowOverwrite: true });
    return blob.url;
  }
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(path.join(config.uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

/** Borra una imagen subida (ignora las del propio sitio, como /static/…). */
export async function deleteImage(url) {
  if (!url) return;
  try {
    if (url.startsWith('/uploads/')) await unlink(path.join(config.uploadsDir, path.basename(url)));
    else if (config.blobToken && url.includes('.blob.vercel-storage.com/')) await del(url, { token: config.blobToken });
  } catch { /* ya no existe */ }
}
