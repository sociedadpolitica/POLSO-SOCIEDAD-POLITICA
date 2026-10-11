# POLSO · Sociedad Política — Temporada XIV

Sitio web del medio universitario POLSO (UFPSO, Ocaña), con panel de redacción integrado.
En producción: **https://www.polso.digital** · Panel: **/admin**

## Desarrollo local

```bash
npm install
cp .env.example .env   # opcional en local
npm run dev            # http://localhost:3000  ·  panel: /admin (admin / polso2026)
```

Requiere Node ≥ 20. En local se usa el archivo `data/polso.db` (SQLite) y la carpeta `uploads/`; no hace falta ningún servicio externo.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm start` | Servidor normal |
| `npm run import:wix` | Trae columnas, revistas y podcast del sitio anterior en Wix (no duplica) |

## Estructura

```
server.js                     Arranque de Express (en Vercel se exporta como función)
vercel.json                   Configuración del despliegue
src/
  config.js                   Variables de entorno y bloqueo de credenciales inseguras en producción
  resources.js                Esquema del contenido: define la BD, la API y los formularios del panel
  db.js                       Cliente libSQL (archivo local o Turso), migraciones y ajustes
  storage.js                  Imágenes: compresión a WebP y guardado en Vercel Blob o en disco
  auth.js                     Sesión firmada (HMAC) y límite de intentos de login
  markdown.js                 Formato del cuerpo de las publicaciones y reproductores embebidos
  routes/public.js            Páginas del sitio
  routes/admin-api.js         API del panel
  services/instagram.js       Último post de Instagram (API o enlace manual)
  services/wix-import.js      Importación del Wix anterior
  services/optimize-images.js Compresión de imágenes ya subidas
  data/wix-excerpts.json      Entradillas escritas para las columnas importadas
views/                        Plantillas EJS (partials/ = piezas compartidas)
public/                       CSS, JS e imágenes del sitio · public/admin/ = panel (sin dependencias)
scripts/import-wix.js         Versión de terminal de la importación
```

**Agregar un campo o una sección:** se edita `src/resources.js`. La tabla, la API y el formulario del panel se actualizan solos.

## Panel de administración (`/admin`)

- **Publicaciones:** columnas, análisis, crónicas… con autor del equipo o columnista invitado (nombre, profesión, posgrados, dónde trabaja y foto). Cada publicación muestra al final el aviso legal configurado en Ajustes.
- **Equipo:** integrantes por área (el Docente aparece destacado primero).
- **Revistas** y **Podcast:** los enlaces de Spotify o YouTube se convierten en reproductor.
- **Ajustes:** identidad, contacto y redes, aviso legal, radio en vivo (día y horario, hora de Colombia) e Instagram.
- Las fotos se reducen en el navegador y se vuelven a optimizar en el servidor (WebP, máx. 1600 px).

## Producción (Vercel + Turso + Vercel Blob)

Cada push a `main` se despliega automáticamente en Vercel. Como Vercel no conserva archivos en disco:

| Variable | Origen |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Integración Turso (Storage → polso-db) |
| `BLOB_READ_WRITE_TOKEN` | Blob store público (Storage → polso-sociedad-politica-blob) |
| `ADMIN_PASSWORD`, `SESSION_SECRET` | Se definen a mano. **Mínimo 12 caracteres**, o el sitio no arranca |
| `ADMIN_USER` (opcional) | Usuario del panel; por defecto `admin` |
| `INSTAGRAM_TOKEN` (opcional) | Token de Instagram Graph API para el último post automático |

**Dominio:** `polso.digital` (Hostinger) apunta a Vercel con `A @ → 216.198.79.1` y `CNAME www → *.vercel-dns-017.com`. `polso.digital` redirige a `www.polso.digital`.

**Planes gratuitos:** Turso 5 GB · Blob 1 GB de almacenamiento y 10 GB de transferencia al mes. Con la compresión a WebP alcanza para decenas de miles de visitas al mes.
