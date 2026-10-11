import express from 'express';
import path from 'node:path';
import { config, ROOT } from './src/config.js';
import publicRoutes from './src/routes/public.js';
import adminApi from './src/routes/admin-api.js';

const app = express();
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.set('trust proxy', 1);
app.locals.v = Date.now().toString(36); // cache-busting de CSS/JS en cada despliegue

app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '7d' }));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(ROOT, 'public', 'admin')));
app.use('/api/admin', adminApi);
app.use('/', publicRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'No encontrado', site: res.locals.site || {}, path: req.path }));
app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Error interno' });
  res.status(500).send('Error interno');
});

export default app;

// En Vercel la app se ejecuta como función; en local, como servidor normal
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`\n  POLSO · Temporada XIV\n  Sitio:  http://localhost:${config.port}\n  Admin:  http://localhost:${config.port}/admin\n`);
  });
}
