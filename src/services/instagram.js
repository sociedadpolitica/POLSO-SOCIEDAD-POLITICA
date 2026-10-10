import { config } from '../config.js';

let cache = { at: 0, token: '', post: null };
const TTL = 15 * 60 * 1000;

/**
 * Devuelve el último post de Instagram.
 * 1) Con token (Graph API) → datos reales, cacheados 15 min.
 * 2) Sin token → enlace manual configurado en el panel (se embebe con el script oficial).
 */
export async function getLatestPost(settings) {
  const token = settings.instagram_token || config.instagramToken;
  if (token) {
    if (cache.token === token && Date.now() - cache.at < TTL && cache.post) return cache.post;
    try {
      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
      const r = await fetch(`https://graph.instagram.com/me/media?fields=${fields}&limit=1&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) });
      const json = await r.json();
      const p = json.data?.[0];
      if (p) {
        cache = { at: Date.now(), token, post: {
          mode: 'api', permalink: p.permalink, caption: p.caption || '',
          image: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url,
          isVideo: p.media_type === 'VIDEO', date: p.timestamp,
        }};
        return cache.post;
      }
    } catch (err) { console.warn('[instagram]', err.message); }
    if (cache.post) return cache.post; // sirve lo último conocido si falla la API
  }
  if (settings.instagram_post_url) return { mode: 'embed', permalink: settings.instagram_post_url.split('?')[0] };
  return null;
}
