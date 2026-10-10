// POLSO · Panel de redacción
// SPA sin dependencias. Los formularios se generan desde el esquema que expone la API.

const app = document.getElementById('app');
const state = { schema: null, cache: {}, dirty: false };

// ── Utilidades ─────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { renderLogin(); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error(data.error || 'Algo salió mal');
  return data;
}

function toast(msg, type = 'ok') {
  const el = Object.assign(document.createElement('div'), { className: `toast toast--${type}`, textContent: msg });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

function confirmDialog(title, text, okLabel = 'Eliminar') {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal__box" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div><button class="btn btn--ghost" data-no>Cancelar</button><button class="btn" data-yes>${esc(okLabel)}</button></div></div>`;
    const close = (v) => { m.remove(); resolve(v); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.dataset.no !== undefined) close(false); if (e.target.dataset.yes !== undefined) close(true); });
    document.body.append(m);
    $('[data-yes]', m).focus();
  });
}

function richToHtml(text = '') {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    if (b.startsWith('> ')) return `<blockquote>${inline(b.replace(/^> ?/gm, ''))}</blockquote>`;
    if (b.startsWith('- ')) return `<ul>${b.split('\n').map((l) => `<li>${inline(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
  }).join('') || '<p style="color:#8A867C">Nada que mostrar aún.</p>';
}

const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d.replace(' ', 'T') + 'Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// ── Login ──────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <div class="login__art"><img src="/static/img/logo-polso.png" alt="POLSO" style="width:140px"><div><h1>Polso<span>.</span></h1><p>Sala de redacción · Temporada XIV</p></div></div>
      <div class="login__form">
        <form id="login" autocomplete="on">
          <h2>Bienvenido de vuelta</h2>
          <label class="field"><span>Usuario</span><input class="input" name="user" autocomplete="username" required autofocus></label>
          <label class="field"><span>Contraseña</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
          <div class="error" hidden></div>
          <button class="btn">Entrar a la redacción →</button>
          <a href="/" style="color:var(--muted);text-align:center;font-size:14px">← Volver al sitio</a>
        </form>
      </div>
    </div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), err = $('.error', e.target), btn = $('button', e.target);
    btn.disabled = true;
    try {
      await api('/login', { method: 'POST', body: { user: f.get('user'), password: f.get('password') } });
      await boot();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; btn.disabled = false; }
  });
}

// ── Estructura ─────────────────────────────────────────
function shell(active, content) {
  const r = state.schema.resources;
  app.innerHTML = `
    <div class="shell">
      <nav class="side" aria-label="Panel">
        <div class="brand"><img src="/static/img/logo-polso-sm.png" alt="" style="width:40px;margin-bottom:10px">Polso<span>.</span><small>Redacción · XIV</small></div>
        <hr>
        <a href="#/" class="side__link ${active === 'home' ? 'is-on' : ''}"><i>⌂</i>Inicio</a>
        ${Object.entries(r).map(([k, d]) => `<a href="#/${k}" class="side__link ${active === k ? 'is-on' : ''}"><i>${d.icon}</i>${d.label}</a>`).join('')}
        <a href="#/settings" class="side__link ${active === 'settings' ? 'is-on' : ''}"><i>⚙</i>Ajustes</a>
        <div class="side__spacer"></div>
        <a href="/" target="_blank" class="side__link side__link--hide"><i>↗</i>Ver sitio</a>
        <button class="side__link side__link--hide" data-logout><i>⎋</i>Cerrar sesión</button>
      </nav>
      <section class="main" id="main">${content}</section>
    </div>`;
  $('[data-logout]')?.addEventListener('click', async () => { await api('/logout', { method: 'POST' }); renderLogin(); });
}

// ── Dashboard ──────────────────────────────────────────
async function viewHome() {
  const { counts, recent } = await api('/stats');
  const r = state.schema.resources;
  const hour = new Date().getHours();
  shell('home', `
    <header class="top"><div><h1>${hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'}.</h1><p>¿Qué vamos a publicar hoy?</p></div>
      <a href="/" target="_blank" class="btn btn--ghost">Ver sitio ↗</a></header>
    <div class="stats">${Object.entries(r).map(([k, d]) => `<a href="#/${k}" class="stat" style="text-decoration:none;color:inherit"><i>${d.icon}</i><b>${counts[k]}</b><span>${d.label}</span></a>`).join('')}</div>
    <div class="quick">
      <a class="btn" href="#/articles/new">＋ Nueva publicación</a>
      <a class="btn btn--ghost" href="#/members/new">＋ Integrante</a>
      <a class="btn btn--ghost" href="#/magazines/new">＋ Revista</a>
      <a class="btn btn--ghost" href="#/episodes/new">＋ Episodio</a>
      <a class="btn btn--ghost" href="#/settings">Actualizar Instagram</a>
    </div>
    <div class="panel"><h3>Editado recientemente</h3>
      ${recent.length ? recent.map((a) => `<a href="#/articles/${a.id}" class="row" style="box-shadow:none;padding-inline:0;grid-template-columns:1fr auto;text-decoration:none">
        <div><strong>${esc(a.title)}</strong><small>${esc(a.kind)} · ${fmtDate(a.updated_at)}</small></div>
        <span class="pill ${a.published ? 'pill--ok' : 'pill--draft'}">${a.published ? 'Publicado' : 'Borrador'}</span></a>`).join('') : '<p style="color:var(--muted)">Aún no hay publicaciones.</p>'}
    </div>`);
}

// ── Listado ────────────────────────────────────────────
async function viewList(resource, openId) {
  const def = state.schema.resources[resource];
  const rows = await api(`/${resource}`);
  state.cache[resource] = rows;
  if (resource === 'articles') state.cache.members = await api('/members');
  const members = Object.fromEntries((state.cache.members || []).map((m) => [m.id, m.name]));

  const rowHtml = (x) => {
    const img = x.cover || x.photo;
    const title = x.title || x.name;
    const meta = resource === 'articles' ? `${esc(x.kind)} · ${esc(x.author_full_name || members[x.author_id] || 'Redacción')} · ${fmtDate(x.published_at)}`
      : resource === 'members' ? esc(x.role || '—')
      : resource === 'magazines' ? `Edición ${esc(x.edition || '—')} · ${fmtDate(x.published_at)}`
      : `Episodio ${esc(x.number || '—')} · ${fmtDate(x.published_at)}`;
    const pills = resource === 'articles'
      ? `${x.featured ? '<span class="pill pill--star">★ Portada</span> ' : ''}<span class="pill ${x.published ? 'pill--ok' : 'pill--draft'}">${x.published ? 'Publicado' : 'Borrador'}</span>` : '';
    return `<button class="row" data-id="${x.id}" data-q="${esc((title + ' ' + meta).toLowerCase())}">
      ${img ? `<img class="thumb" src="${esc(img)}" alt="">` : `<span class="thumb">${esc((title || '?')[0])}</span>`}
      <div><strong>${esc(title)}</strong><small>${meta}</small></div><div>${pills}</div></button>`;
  };

  shell(resource, `
    <header class="top"><div><h1>${def.label}</h1><p>${rows.length} ${rows.length === 1 ? 'elemento' : 'elementos'}</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;width:100%;max-width:520px;justify-content:flex-end">
        ${rows.length > 4 ? '<input class="input search" placeholder="Buscar…" data-search>' : ''}
        <a class="btn" href="#/${resource}/new">＋ ${def.singular}</a></div></header>
    ${rows.length ? `<div class="list">${rows.map(rowHtml).join('')}</div>`
      : `<div class="empty"><b>Todavía no hay nada aquí</b>Crea el primer elemento y aparecerá al instante en el sitio.<br><br><a class="btn" href="#/${resource}/new">＋ Crear ${def.singular.toLowerCase()}</a></div>`}`);

  $$('.row[data-id]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/${resource}/${b.dataset.id}`; }));
  $('[data-search]')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    $$('.row[data-q]').forEach((r) => { r.hidden = q && !r.dataset.q.includes(q); });
  });
  if (openId) openEditor(resource, openId === 'new' ? null : Number(openId));
}

// ── Campos de formulario ───────────────────────────────
function fieldHtml(f, value) {
  const v = value ?? f.default ?? '';
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  const label = `<span>${esc(f.label)}${f.required ? ' <b style="color:var(--red)">*</b>' : ''}</span>`;
  switch (f.type) {
    case 'heading':
      return `<div class="form-heading"><h3>${esc(f.label)}</h3>${hint}</div>`;
    case 'textarea':
      return `<label class="field">${label}<textarea class="input" name="${f.name}">${esc(v)}</textarea>${hint}</label>`;
    case 'richtext':
      return `<div class="field">${label}<div class="rte" data-rte>
        <div class="rte__bar">
          <button type="button" data-md="bold" title="Negrita"><b>B</b></button>
          <button type="button" data-md="italic" title="Cursiva"><i>I</i></button>
          <button type="button" data-md="h2" title="Subtítulo">H2</button>
          <button type="button" data-md="quote" title="Cita destacada">❝</button>
          <button type="button" data-md="list" title="Lista">•</button>
          <button type="button" data-md="link" title="Enlace">🔗</button>
          <span class="sep"></span>
          <button type="button" data-preview>Vista previa</button>
        </div>
        <textarea name="${f.name}" placeholder="Escribe aquí…">${esc(v)}</textarea>
        <div class="rte__preview" hidden></div>
        <div class="rte__count"></div></div>${hint}</div>`;
    case 'image':
      return `<div class="field">${label}<div class="drop ${v ? 'drop--has' : ''}" data-drop>
        <input type="hidden" name="${f.name}" value="${esc(v)}">
        ${v ? `<img src="${esc(v)}" alt=""><div class="drop__actions"><button type="button" data-replace>Cambiar</button><button type="button" data-clear>Quitar</button></div>`
            : `<div><div class="drop__icon">⇪</div><b>Arrastra una foto o toca para elegir</b><small>JPG, PNG o WEBP · hasta 12 MB</small></div>`}
        <input type="file" accept="image/*" data-file ${v ? 'hidden' : ''}>
        <div class="drop__bar" style="width:0"></div></div>${hint}</div>`;
    case 'select':
      return `<label class="field">${label}<select class="input" name="${f.name}">${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${hint}</label>`;
    case 'relation': {
      const opts = state.cache[f.resource] || [];
      return `<label class="field">${label}<select class="input" name="${f.name}"><option value="">— Redacción POLSO —</option>
        ${opts.map((o) => `<option value="${o.id}" ${Number(v) === o.id ? 'selected' : ''}>${esc(o.name || o.title)}</option>`).join('')}</select>${hint}</label>`;
    }
    case 'checkbox':
      return `<label class="switch"><input type="checkbox" name="${f.name}" ${Number(v) ? 'checked' : ''}>${esc(f.label)}</label>`;
    case 'date':
      return `<label class="field">${label}<input class="input" type="date" name="${f.name}" value="${esc(v || new Date().toISOString().slice(0, 10))}">${hint}</label>`;
    default:
      return `<label class="field">${label}<input class="input" type="${f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}" name="${f.name}" value="${esc(v)}" ${f.required ? 'required' : ''}>${hint}</label>`;
  }
}

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || '{}');
      xhr.status < 300 ? resolve(data.url) : reject(new Error(data.error || 'Error al subir'));
    };
    xhr.onerror = () => reject(new Error('Sin conexión'));
    xhr.open('POST', '/api/admin/upload');
    xhr.send(fd);
  });
}

function bindImage(drop) {
  const hidden = $('input[type=hidden]', drop);
  const name = hidden.name;
  const field = { name, type: 'image', label: '' };
  const rerender = (url) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = fieldHtml(field, url);
    const fresh = $('[data-drop]', tmp);
    drop.replaceWith(fresh);
    bindImage(fresh);
    state.dirty = true;
  };
  const handle = async (file) => {
    if (!file?.type.startsWith('image/')) return toast('Ese archivo no es una imagen', 'error');
    const bar = $('.drop__bar', drop);
    try {
      const url = await uploadFile(file, (p) => { bar.style.width = `${p * 100}%`; });
      rerender(url);
      toast('Imagen subida');
    } catch (e) { bar.style.width = 0; toast(e.message, 'error'); }
  };
  const fileInput = $('[data-file]', drop);
  fileInput.addEventListener('change', () => handle(fileInput.files[0]));
  $('[data-replace]', drop)?.addEventListener('click', () => fileInput.click());
  $('[data-clear]', drop)?.addEventListener('click', () => rerender(''));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); handle(e.dataTransfer.files[0]); });
}

function bindRich(rte) {
  const ta = $('textarea', rte), preview = $('.rte__preview', rte), count = $('.rte__count', rte);
  const updateCount = () => {
    const words = ta.value.trim().split(/\s+/).filter(Boolean).length;
    count.textContent = `${words} palabras · ${Math.max(1, Math.round(words / 220))} min de lectura`;
  };
  const wrap = (before, after = before, placeholder = 'texto') => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'end');
    ta.focus(); ta.dispatchEvent(new Event('input'));
  };
  const linePrefix = (prefix) => {
    const s = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.setRangeText(prefix, lineStart, lineStart, 'end');
    ta.focus(); ta.dispatchEvent(new Event('input'));
  };
  const actions = {
    bold: () => wrap('**'), italic: () => wrap('*'),
    h2: () => linePrefix('## '), quote: () => linePrefix('> '), list: () => linePrefix('- '),
    link: () => { const url = prompt('Pega el enlace (https://…)'); if (url) wrap('[', `](${url})`, 'enlace'); },
  };
  $$('[data-md]', rte).forEach((b) => b.addEventListener('click', () => actions[b.dataset.md]()));
  $('[data-preview]', rte).addEventListener('click', (e) => {
    const on = preview.hidden;
    preview.hidden = !on; ta.hidden = on;
    e.target.classList.toggle('is-on', on);
    e.target.textContent = on ? 'Editar' : 'Vista previa';
    if (on) preview.innerHTML = richToHtml(ta.value);
  });
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); actions.bold(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); actions.italic(); }
  });
  ta.addEventListener('input', updateCount);
  updateCount();
}

// ── Editor ─────────────────────────────────────────────
async function openEditor(resource, id) {
  const def = state.schema.resources[resource];
  const item = id ? await api(`/${resource}/${id}`) : {};
  state.dirty = false;

  const bg = Object.assign(document.createElement('div'), { className: 'drawer-bg' });
  const drawer = document.createElement('form');
  drawer.className = 'drawer';
  drawer.noValidate = true;
  const viewUrl = id && { articles: `/publicaciones/${item.slug}`, members: `/equipo/${item.slug}`, magazines: '/revistas', episodes: '/podcast' }[resource];
  drawer.innerHTML = `
    <header class="drawer__head"><h2>${id ? 'Editar' : 'Nueva'} ${def.singular.toLowerCase()}</h2>
      <div style="display:flex;gap:8px">${viewUrl ? `<a class="btn btn--ghost" href="${viewUrl}" target="_blank">Ver ↗</a>` : ''}<button type="button" class="x" data-close aria-label="Cerrar">×</button></div></header>
    <div class="drawer__body"><div class="group">${def.fields.map((f) => fieldHtml(f, f.name && item[f.name])).join('').replaceAll('<div class="form-heading">', '</div><div class="group"><div class="form-heading">').replace('<div class="group"></div>', '')}</div><div class="error" hidden></div></div>
    <footer class="drawer__foot">
      <div>${id ? '<button type="button" class="btn btn--danger" data-delete>🗑 <span>Eliminar</span></button>' : ''}</div>
      <div><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button class="btn" data-save>${id ? 'Guardar cambios' : 'Publicar'}</button></div>
    </footer>`;
  document.body.append(bg, drawer);
  document.body.style.overflow = 'hidden';
  $$('[data-drop]', drawer).forEach(bindImage);
  $$('[data-rte]', drawer).forEach(bindRich);
  drawer.addEventListener('input', () => { state.dirty = true; });
  setTimeout(() => $('input:not([type=hidden]):not([type=file]), textarea', drawer)?.focus(), 50);

  const close = async (force = false) => {
    if (!force && state.dirty && !(await confirmDialog('¿Descartar cambios?', 'Tienes cambios sin guardar.', 'Descartar'))) return;
    bg.remove(); drawer.remove(); document.body.style.overflow = '';
    removeEventListener('keydown', onKey);
    if (location.hash !== `#/${resource}`) history.replaceState(null, '', `#/${resource}`);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && !$('.modal')) close();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); drawer.requestSubmit(); }
  };
  addEventListener('keydown', onKey);
  bg.addEventListener('click', () => close());
  $$('[data-close]', drawer).forEach((b) => b.addEventListener('click', () => close()));

  drawer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[data-save]', drawer), err = $('.error', drawer);
    btn.disabled = true; err.hidden = true;
    try {
      await api(id ? `/${resource}/${id}` : `/${resource}`, { method: id ? 'PUT' : 'POST', body: readForm(drawer, def.fields) });
      toast(id ? 'Cambios guardados' : `${def.singular} creada`);
      await close(true);
      viewList(resource);
    } catch (ex) { err.hidden = false; err.textContent = ex.message; btn.disabled = false; }
  });

  $('[data-delete]', drawer)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`¿Eliminar "${item.title || item.name}"?`, 'Esta acción no se puede deshacer.'))) return;
    await api(`/${resource}/${id}`, { method: 'DELETE' });
    toast('Eliminado');
    await close(true);
    viewList(resource);
  });
}

// ── Ajustes ────────────────────────────────────────────
async function viewSettings() {
  const values = await api('/settings');
  const groups = state.schema.settings;
  shell('settings', `
    <header class="top"><div><h1>Ajustes del sitio</h1><p>Identidad, contacto, redes e Instagram en vivo.</p></div></header>
    <form id="settings" style="display:grid;gap:20px;max-width:820px">
      ${groups.map((g) => `<section class="group"><h3>${esc(g.group)}</h3>${g.fields.map((f) => fieldHtml(f, values[f.name])).join('')}</section>`).join('')}
      <div><button class="btn">Guardar ajustes</button></div>
    </form>`);
  const form = $('#settings');
  $$('[data-drop]', form).forEach(bindImage);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/settings', { method: 'PUT', body: readForm(form, groups.flatMap((g) => g.fields)) });
      toast('Ajustes guardados');
    } catch (ex) { toast(ex.message, 'error'); }
  });
}

// ── Router ─────────────────────────────────────────────
async function route() {
  const [, section = '', sub] = location.hash.split('/');
  try {
    if (!section) return await viewHome();
    if (section === 'settings') return await viewSettings();
    if (state.schema.resources[section]) {
      // Si ya estamos en el listado, solo abre el editor
      if (sub && $('.side__link.is-on')?.getAttribute('href') === `#/${section}` && !$('.drawer')) {
        if (section === 'articles') state.cache.members = await api('/members');
        return openEditor(section, sub === 'new' ? null : Number(sub));
      }
      if (!$('.drawer')) return await viewList(section, sub);
      return;
    }
    location.hash = '#/';
  } catch (e) { if (e.message !== 'Sesión expirada') toast(e.message, 'error'); }
}

async function boot() {
  const { authenticated } = await api('/me');
  if (!authenticated) return renderLogin();
  state.schema = await api('/schema');
  route();
}

addEventListener('hashchange', () => state.schema && route());
boot();
