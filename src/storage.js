import { put, del } from '@vercel/blob';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/** Guarda una imagen y devuelve su URL pública (Vercel Blob en producción, disco en local). */
export async function saveImage(buffer, filename, contentType) {
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
