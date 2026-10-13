/**
 * Definición declarativa del contenido. Un único esquema alimenta
 * la base de datos, la API del administrador y los formularios del panel.
 *
 * Tipos de campo: text, textarea, richtext, image, url, select, number, checkbox, date
 */
/** Áreas del equipo, en el orden en que aparecen en el sitio. */
export const AREAS = ['Docente', 'Dirección', 'Televisión', 'Radio', 'Redes sociales', 'Diseño gráfico', 'Sitio web'];

export const resources = {
  articles: {
    label: 'Publicaciones',
    singular: 'Publicación',
    icon: '✎',
    order: 'published_at DESC',
    listFields: ['cover', 'title', 'kind', 'published'],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'kind', label: 'Tipo', type: 'select', options: ['columna', 'análisis', 'crónica', 'entrevista', 'noticia'], default: 'columna' },
      { name: 'section', label: 'Sección temática', type: 'select', options: ['Política', 'Desarrollo sostenible', 'Políticas públicas', 'Región', 'Opinión', 'Cultura'], default: 'Política' },
      { name: 'excerpt', label: 'Entradilla (resumen corto)', type: 'textarea', hint: 'Una o dos frases que enganchen al lector.' },
      { name: 'body', label: 'Cuerpo del texto', type: 'richtext', hint: 'Separa párrafos con una línea en blanco. **negrita**, *cursiva*, ## Subtítulo, > Cita destacada' },
      { name: 'cover', label: 'Imagen de portada', type: 'image' },
      { type: 'heading', label: 'Autor', hint: 'Si es de POLSO, elígelo en la lista: se usarán su foto y sus datos del perfil del equipo. Si es un invitado, deja «Redacción POLSO» y escribe sus datos.' },
      { name: 'author_id', label: 'Integrante del equipo', type: 'relation', resource: 'members' },
      { name: 'author_full_name', label: 'Nombre completo', type: 'text', hint: 'Ej: María Fernanda Pérez Quintero' },
      { name: 'author_profession', label: 'Profesión', type: 'text', hint: 'Ej: Abogada, Comunicador social, Economista' },
      { name: 'author_studies', label: 'Posgrados y estudios', type: 'textarea', hint: 'Ej: Magíster en Gobierno y Políticas Públicas (Universidad Externado). Uno por línea.' },
      { name: 'author_workplace', label: 'Dónde trabaja / cargo actual', type: 'text', hint: 'Ej: Docente de la UFPSO · Asesora en la Gobernación de Norte de Santander' },
      { name: 'author_photo', label: 'Foto del autor', type: 'image' },
      { type: 'heading', label: 'Publicación' },
      { name: 'published_at', label: 'Fecha de publicación', type: 'date' },
      { name: 'featured', label: 'Destacar en portada', type: 'checkbox' },
      { name: 'published', label: 'Publicado (visible)', type: 'checkbox', default: 1 },
    ],
  },
  members: {
    label: 'Equipo',
    singular: 'Integrante',
    icon: '◉',
    order: 'position ASC, id ASC',
    listFields: ['photo', 'name', 'area'],
    fields: [
      { name: 'name', label: 'Nombre completo', type: 'text', required: true },
      { name: 'area', label: 'Área', type: 'select', options: AREAS, default: 'Televisión' },
      { name: 'role', label: 'Cargo', type: 'text', hint: 'Ej: Presentadora, Productor, Community manager…' },
      { name: 'profession', label: 'Profesión', type: 'text', hint: 'Ej: Estudiante de Comunicación Social, Abogado…' },
      { name: 'studies', label: 'Posgrados y estudios', type: 'textarea', hint: 'Uno por línea.' },
      { name: 'workplace', label: 'Dónde trabaja / cargo actual', type: 'text' },
      { name: 'bio', label: 'Biografía breve', type: 'textarea' },
      { name: 'photo', label: 'Foto', type: 'image' },
      { name: 'instagram', label: 'Instagram (URL)', type: 'url' },
      { name: 'position', label: 'Orden de aparición', type: 'number', default: 0 },
    ],
  },
  magazines: {
    label: 'Revistas',
    singular: 'Revista',
    icon: '▤',
    order: 'published_at DESC',
    listFields: ['cover', 'title', 'edition'],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'edition', label: 'Edición / número', type: 'text', hint: 'Ej: XIV' },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'cover', label: 'Portada', type: 'image' },
      { name: 'link', label: 'Enlace a la revista (PDF, Issuu, Drive…)', type: 'url' },
      { name: 'published_at', label: 'Fecha', type: 'date' },
    ],
  },
  episodes: {
    label: 'Podcast',
    singular: 'Episodio',
    icon: '◖',
    order: 'published_at DESC',
    listFields: ['cover', 'title', 'number'],
    fields: [
      { name: 'title', label: 'Título del episodio', type: 'text', required: true },
      { name: 'number', label: 'Número', type: 'number' },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'cover', label: 'Imagen', type: 'image' },
      { name: 'link', label: 'Enlace (Spotify o YouTube)', type: 'url', hint: 'Se convierte automáticamente en reproductor.' },
      { name: 'published_at', label: 'Fecha', type: 'date' },
    ],
  },
};

/** Ajustes globales editables desde el panel. */
export const settingsSchema = [
  { group: 'Identidad', fields: [
    { name: 'edition', label: 'Temporada actual', type: 'text', default: 'XIV' },
    { name: 'tagline', label: 'Lema', type: 'text', default: 'Liderando desde la opinión' },
    { name: 'about', label: 'Quiénes somos', type: 'textarea', default: 'POLSO Sociedad Política es un medio de análisis y divulgación sobre la sociedad política, con énfasis en el desarrollo sostenible y las políticas públicas y privadas. Promovemos el pensamiento crítico, la toma de decisiones informada y la búsqueda de soluciones para el bienestar colectivo.' },
    { name: 'hero_image', label: 'Imagen principal de portada', type: 'image', default: '/static/img/equipo-xiv-foto.jpg' },
    { name: 'quote', label: 'Cita de portada', type: 'textarea', default: 'La libertad nunca es otorgada voluntariamente por el opresor; debe ser exigida por el oprimido.' },
    { name: 'quote_author', label: 'Autor de la cita', type: 'text', default: 'Martin Luther King Jr.' },
  ]},
  { group: 'Contacto y redes', fields: [
    { name: 'email', label: 'Correo', type: 'text', default: 'polso.sociedadpolitica@gmail.com' },
    { name: 'location', label: 'Ubicación', type: 'text', default: 'Ocaña, Norte de Santander, Colombia' },
    { name: 'instagram_url', label: 'Instagram', type: 'url', default: 'https://www.instagram.com/polso_oficial/' },
    { name: 'facebook_url', label: 'Facebook', type: 'url', default: 'https://www.facebook.com/polso.sociedadpolitica/' },
    { name: 'youtube_url', label: 'YouTube', type: 'url', default: 'https://www.youtube.com/channel/UC48aR3exW85BM7rM_6m7zrg' },
    { name: 'spotify_url', label: 'Spotify', type: 'url', default: '' },
    { name: 'ufpso_url', label: 'Página del programa en la UFPSO', type: 'url', default: 'https://comunicacionsocial.ufpso.edu.co/?page_id=4025' },
  ]},
  { group: 'Aviso legal de las publicaciones', fields: [
    { name: 'disclaimer', label: 'Texto que aparece al final de cada publicación', type: 'textarea', default: 'Las opiniones y conceptos expresados en esta sección son responsabilidad exclusiva de sus respectivos autores y no representan necesariamente la posición editorial de esta plataforma digital. Este espacio está destinado al ejercicio responsable de la libertad de expresión, la pluralidad de ideas y el debate público. La publicación de una columna no implica respaldo, adhesión o coincidencia del medio con las opiniones expresadas por su firmante, cuyo contenido compromete exclusivamente a quien lo suscribe.' },
  ]},
  { group: 'Radio en vivo', fields: [
    { name: 'radio_name', label: 'Nombre del programa', type: 'text', default: 'Radio POLSO Sociedad Política' },
    { name: 'radio_station', label: 'Emisora', type: 'text', default: 'La UFM Estéreo' },
    { name: 'radio_url', label: 'Página de la emisora', type: 'url', default: 'https://laufm.ufpso.edu.co/home' },
    { name: 'radio_stream', label: 'Stream de audio (reproductor en el sitio)', type: 'url', default: 'https://streamingufm.ufpso.edu.co/getStream', hint: 'Dirección directa del audio en vivo. Si se deja vacío, solo se muestra el enlace a la emisora.' },
    { name: 'radio_day', label: 'Día de emisión', type: 'select', options: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'], default: 'viernes' },
    { name: 'radio_start', label: 'Hora de inicio (24 h)', type: 'text', default: '14:00', hint: 'Formato HH:MM, hora de Colombia.' },
    { name: 'radio_end', label: 'Hora de fin (24 h)', type: 'text', default: '14:45' },
  ]},
  { group: 'Instagram en vivo', fields: [
    { name: 'instagram_token', label: 'Token de Instagram Graph API', type: 'text', hint: 'Con token, el último post se muestra solo. Sin token, pega abajo el enlace del último post.' },
    { name: 'instagram_post_url', label: 'Enlace del último post (respaldo manual)', type: 'url', default: 'https://www.instagram.com/p/DeQinS_R-W4/', hint: 'Ej: https://www.instagram.com/p/XXXXXXXX/' },
  ]},
];
