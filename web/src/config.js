// Todo lo que cambia de una biblioteca a otra sale de aquí. Los valores se
// leen de web/.env (o web/.env.local) o de las variables de entorno de
// Vercel (en el sitio publicado). Ver web/.env.example y docs/es/guia.md.
//
// Everything that changes from one library to another comes from here. Values
// are read from web/.env (or web/.env.local) or from Vercel environment
// variables (on the published site). See web/.env.example and docs/en/guide.md.

const env = import.meta.env;

// ID de cliente OAuth de Google Cloud (termina en .apps.googleusercontent.com).
// Vacío: la app arranca en modo demostración, con el catálogo de ejemplo.
export const CLIENT_ID = (env.VITE_GOOGLE_CLIENT_ID || '').trim();

// Nombre de la biblioteca. El destacado se muestra junto al nombre con otro color
// (por ejemplo «Biblioteca» + «Ramírez»). Ambos son opcionales.
export const NOMBRE = (env.VITE_LIBRARY_NAME || '').trim();
export const DESTACADO = (env.VITE_LIBRARY_ACCENT || '').trim();

// Nombre de la carpeta de Drive, solo para el mensaje que ve quien todavía no
// tiene acceso («pide que te compartan…»).
export const CARPETA = (env.VITE_DRIVE_FOLDER_NAME || '').trim();

// Nombre del archivo del catálogo en Drive. Debe ser el mismo que NOMBRE_CATALOGO
// en apps-script/config.gs.
export const NOMBRE_CATALOGO = (env.VITE_CATALOG_FILE || 'biblioteca-catalogo.json').trim();

// Archivo con Mi Mochila y las notas en la carpeta privada de la app (appDataFolder)
// de cada lector.
export const NOMBRE_PERSONAL = 'biblioteca-personal.json';

// Huellas SHA-256 de los correos invitados (las escribe `npm run permitir`).
// Vacía: entra cualquier usuario de prueba del cliente OAuth.
export const PERMITIDOS = (env.VITE_ALLOWED || '').split(',').map((h) => h.trim()).filter(Boolean);

// Sal de las huellas: debe ser la misma que usa scripts/permitir.mjs (que la lee
// del mismo .env). Cambiarla invalida todas las invitaciones anteriores.
export const SAL = (env.VITE_INVITE_SALT || 'arma-tu-biblioteca').trim();

// Idioma inicial de la interfaz: "es" o "en". Cada lector puede cambiarlo.
export const IDIOMA_INICIAL = (env.VITE_DEFAULT_LANG || '').trim();

// Sin ID de cliente no hay Google: se usa el catálogo de demostración, cuyos
// archivos (id que empieza con "demo-") se sirven desde web/demo/. Los
// "demo-sin-archivo-…" solo aparecen en el catálogo y no se pueden abrir.
export const DEMO = !CLIENT_ID;
export const esDemo = (id = '') => id.startsWith('demo-');
export const leibleEnDemo = (id = '') => esDemo(id) && !id.startsWith('demo-sin-archivo');
