// POLSO · interacciones del sitio público
(() => {
  const burger = document.querySelector('[data-burger]');
  const nav = document.getElementById('nav');
  const toggle = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
  };
  burger?.addEventListener('click', () => toggle(!nav.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));

  const masthead = document.querySelector('[data-masthead]');
  const progress = document.querySelector('[data-progress]');
  const onScroll = () => {
    masthead?.classList.toggle('is-scrolled', scrollY > 40);
    if (progress) {
      const h = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = `${Math.min(100, (scrollY / h) * 100)}%`;
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Compartir: nativo en móvil, copiar enlace en escritorio
  document.querySelector('[data-share]')?.addEventListener('click', async (e) => {
    const url = location.href;
    if (navigator.share) return navigator.share({ title: document.title, url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    e.target.textContent = '¡Enlace copiado!';
  });
  document.querySelectorAll('[data-wa],[data-x]').forEach((a) => { a.href += encodeURIComponent(' ' + location.href); });
})();

// Radio en vivo: reproduce el stream de La UFM sin salir del sitio
(() => {
  const box = document.querySelector('[data-radio]');
  const btn = box?.querySelector('[data-radio-play]');
  const audio = box?.querySelector('audio');
  if (!btn || !audio) return;
  const label = box.querySelector('[data-radio-label]');
  const idle = label.textContent;
  const set = (state) => {
    box.classList.toggle('is-loading', state === 'loading');
    box.classList.toggle('is-playing', state === 'playing');
    label.textContent = state === 'playing' ? 'Sonando en vivo' : state === 'loading' ? 'Conectando…' : state === 'error' ? 'No cargó aquí · escúchala en La UFM →' : idle;
    btn.setAttribute('aria-label', state === 'playing' ? 'Pausar la radio' : 'Escuchar la radio en vivo');
  };
  let timer;
  const stop = () => { clearTimeout(timer); audio.pause(); audio.removeAttribute('src'); audio.load(); };
  btn.addEventListener('click', () => {
    if (box.classList.contains('is-playing') || box.classList.contains('is-loading')) { stop(); set('idle'); return; }
    // Se reconecta al stream cada vez para escuchar en directo, no lo almacenado
    audio.src = audio.dataset.src;
    set('loading');
    audio.play().catch(() => { stop(); set('error'); });
    // Si el navegador no logra reproducir el stream, se ofrece la página de la emisora
    timer = setTimeout(() => { if (!box.classList.contains('is-playing')) { stop(); set('error'); } }, 10000);
  });
  audio.addEventListener('playing', () => { clearTimeout(timer); set('playing'); });
  audio.addEventListener('waiting', () => set('loading'));
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) set('error'); });
})();
