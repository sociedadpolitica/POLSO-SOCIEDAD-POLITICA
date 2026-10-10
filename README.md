# POLSO · Sociedad Política — XIV Edición

Sitio web del medio POLSO (Ocaña, Norte de Santander) con panel de redacción integrado. Se adapta a web y móvil.

## Arranque

```bash
cp .env.example .env   # cambia ADMIN_PASSWORD y SESSION_SECRET
npm install
npm start              # http://localhost:3000  ·  panel: /admin
```

Requiere Node ≥ 22.13 (usa SQLite nativo `node:sqlite`, sin servicios externos).

## Qué incluye

- **Sitio público** (renderizado en servidor, bueno para SEO): portada editorial, publicaciones con filtros, artículo con barra de progreso y botones para compartir, equipo con perfiles, revistas, podcast con reproductor de Spotify/YouTube y bloque de **último post de Instagram**.
- **Panel `/admin`**: inicio con métricas, crear/editar/eliminar publicaciones, equipo, revistas y episodios. Las fotos se suben arrastrándolas, el editor de texto tiene vista previa y el diseño de ajustes es claro. En el móvil funciona como una app, con una barra inferior.

## Instagram en vivo

En **Admin → Ajustes → Instagram en vivo**:
1. **Automático:** pega un token de Instagram Graph API (requiere cuenta Business o Creator). El último post se actualiza solo y se guarda en caché durante 15 minutos.
2. **Manual:** pega el enlace del último post y se muestra con el embed oficial.

## Estructura

```
server.js                 Arranque de Express
src/resources.js          Esquema del contenido: define la BD, la API y los formularios del panel
src/db.js                 SQLite, migraciones automáticas y ajustes
src/auth.js               Sesión firmada (HMAC) y límite de intentos de login
src/routes/public.js      Páginas públicas
src/routes/admin-api.js   API REST del panel y subida de imágenes
src/services/instagram.js Último post de Instagram
views/                    Plantillas EJS
public/css, public/js     Estilos e interacciones del sitio
public/admin/             Panel de redacción (SPA sin dependencias)
data/, uploads/           Base de datos e imágenes (fuera de git)
```

Para añadir un campo o una sección nueva, edita `src/resources.js`. La tabla, la API y el formulario se actualizan solos.

## Importar el contenido del Wix anterior

```bash
npm run import:wix
```

Trae del sitio anterior las columnas (con autor, profesión, fecha, texto y foto), las revistas con sus portadas y enlaces, y el podcast. Se puede ejecutar varias veces: no duplica lo que ya existe. Ejecútalo una vez en el servidor después del primer despliegue.

## Producción

Despliégalo en un VPS, Railway o Render con un **disco persistente** para `data/` y `uploads/`. Configura `NODE_ENV=production` para que la cookie de sesión sea `secure`.
