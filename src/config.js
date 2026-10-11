import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga mínima de .env sin dependencias
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

// En producción nunca se arranca con las credenciales de ejemplo
if (isProd) {
  const missing = ['ADMIN_PASSWORD', 'SESSION_SECRET'].filter((k) => !process.env[k] || process.env[k].length < 12);
  if (missing.length) throw new Error(`Faltan variables de entorno seguras (mínimo 12 caracteres): ${missing.join(', ')}`);
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'polso2026',
  sessionSecret: process.env.SESSION_SECRET || 'polso-dev-secret-change-me',
  instagramToken: process.env.INSTAGRAM_TOKEN || '',
  // Base de datos: Turso (libSQL) en producción; archivo SQLite local en desarrollo
  dbUrl: process.env.TURSO_DATABASE_URL || `file:${path.join(ROOT, 'data', 'polso.db')}`,
  dbToken: process.env.TURSO_AUTH_TOKEN || undefined,
  // Imágenes: Vercel Blob si hay token; si no, carpeta local
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',
  uploadsDir: path.join(ROOT, 'uploads'),
};
