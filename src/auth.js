import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'polso_session';
const MAX_AGE = 1000 * 60 * 60 * 12; // 12 h

const sign = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function checkCredentials(user, pass) {
  return safeEqual(user, config.adminUser) && safeEqual(pass, config.adminPassword);
}

export function createSession(res) {
  const payload = Buffer.from(JSON.stringify({ u: config.adminUser, exp: Date.now() + MAX_AGE })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE });
}

export function destroySession(res) { res.clearCookie(COOKIE); }

function readSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

export function requireAdmin(req, res, next) {
  if (readSession(req)) return next();
  res.status(401).json({ error: 'No autorizado' });
}

export const isAdmin = (req) => Boolean(readSession(req));

// Freno simple contra fuerza bruta en el login
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const key = req.ip, now = Date.now();
  const rec = attempts.get(key) || { n: 0, t: now };
  if (now - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = now; }
  if (rec.n >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  rec.n++; attempts.set(key, rec);
  next();
}
