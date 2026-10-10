/** Renderizador mínimo y seguro para textos editoriales. */
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

export function renderRich(text = '') {
  return String(text).replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(block => {
    if (block.startsWith('## ')) return `<h2>${inline(block.slice(3))}</h2>`;
    if (block.startsWith('> ')) return `<blockquote>${inline(block.replace(/^> ?/gm, ''))}</blockquote>`;
    if (/^- /.test(block)) return `<ul>${block.split('\n').map(l => `<li>${inline(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

export function readingTime(text = '') {
  return Math.max(1, Math.round(String(text).split(/\s+/).length / 220));
}

/** Convierte enlaces de Spotify/YouTube en URL embebible. */
export function embedUrl(link = '') {
  try {
    const u = new URL(link);
    if (u.hostname.includes('spotify.com')) return `https://open.spotify.com/embed${u.pathname}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
  } catch {}
  return null;
}
